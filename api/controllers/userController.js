const becryptService = require('../services/bcrypt.services');
const jwtService = require('../services/jwt.services');
const resModel = require('../lib/resModel');
const path = require('path');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
let User = require("../models/userModel");
let Role = require("../models/roleModel");
let Onboarding = require("../models/onboarding.model");
const bcryptServices = require('../services/bcrypt.services');
const emailService = require('../services/email.service');
const s3 = require("../config/s3");

const PROFILE_URL_EXPIRES_IN = 600;
const PROFILE_IMAGES_PREFIX = 'profile-images/';

const buildProfileSignedUrl = async (profileValue) => {
    if (!profileValue) return null;
    if (/^https?:\/\//i.test(profileValue)) return profileValue;

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: profileValue
    });

    return getSignedUrl(s3, command, { expiresIn: PROFILE_URL_EXPIRES_IN });
};

const extractProfileS3Key = (profileValue) => {
    if (!profileValue) return null;
    if (!/^https?:\/\//i.test(profileValue)) return profileValue;

    try {
        const parsedUrl = new URL(profileValue);
        return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')) || null;
    } catch (error) {
        return null;
    }
};

const isManagedProfileKey = (key) => typeof key === 'string' && key.startsWith(PROFILE_IMAGES_PREFIX);

/**
 * @api {post} /api/admin/signup Signup User
 * @apiName Signup User
 * @apiGroup User
 * @apiBody {String} first_name User FirstName.
 * @apiBody {String} last_name User LastName.
 * @apiBody {String} email User Email.
 * @apiBody {String} password Password.
 * @apiBody {String} confirmPassword ConfirmPassword.
 * @apiDescription User Service...
 * @apiSampleRequest http://localhost:2001/api/admin/signup
 */
module.exports.signupUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password, confirmPassword, plan } = req.body;
        const userCheck = await User.findOne({ email });
        if (userCheck) {
            resModel.success = false;
            resModel.message = "User Already Exists";
            resModel.data = null;
            res.status(201).json(resModel);
        } else {
            if (password == confirmPassword) {
                let passwordHash = await becryptService.generatePassword(password)
                if (passwordHash) {
                    // Client self-registration gets role_id: 3
                    let userInfo = {
                        email: email.toLowerCase(),
                        password: passwordHash,
                        first_name: first_name,
                        last_name: last_name,
                        plan: plan ?? null,
                        role_id: '3' // Client role for self-registration
                    }
                    const newUser = new User(userInfo)
                    let users = await newUser.save();
                    if (users) {
                        // Generate JWT token for auto-login after signup
                        const accessToken = await jwtService.issueJwtToken({
                            email: users.email,
                            id: users._id,
                            first_name: users.first_name,
                            role_id: users.role_id
                        });

                        // Remove password from response
                        users.password = undefined;
                        
                        // Add onboarding_completed status for client users
                        // New signups will have onboarding_completed: false
                        const userResponse = users.toObject();
                        if (userResponse.role_id === '3') {
                            userResponse.onboarding_completed = false;
                        } else {
                            userResponse.onboarding_completed = true; // Non-clients don't need onboarding
                        }

                        resModel.success = true;
                        resModel.message = "User Registration Successful";
                        resModel.data = { token: accessToken, user: userResponse };
                        res.status(200).json(resModel);

                    } else {
                        resModel.success = false;
                        resModel.message = "Error while creating User";
                        resModel.data = null;
                        res.status(400).json(resModel);
                    }
                } else {
                    resModel.success = false;
                    resModel.message = "Something went wrong";
                    resModel.data = null;
                    res.status(500).json(resModel)
                }
            } else {
                resModel.success = false;
                resModel.message = "Please enter password and confirm should be same";
                resModel.data = null;
                res.status(400).json(resModel);
            }
        }
    } catch (error) {
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);

    }
}
/**
 * @api {post} /api/admin/signin Signin User
 * @apiName SinginUser
 * @apiGroup User
 * @apiBody {String} email User Email.
 * @apiBody {String} password Password.
 * @apiDescription User Service...
 * @apiSampleRequest http://localhost:2001/api/admin/signin
 */
module.exports.signInUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(req.body);
        const emails = email.toLowerCase();

        // Find user by email
        const userCheck = await User.findOne({ email: emails });
        if (!userCheck) {
            resModel.success = false;
            resModel.message = "Please create an account first";
            resModel.data = null;
            return res.status(400).json(resModel);
        }

        // Check if user is active
        if (!userCheck.active) {
            resModel.success = false;
            resModel.message = "Your account has been deactivated. Please contact administrator";
            resModel.data = null;
            return res.status(403).json(resModel);
        }

        // Compare password
        const passwordMatch = await bcryptServices.comparePassword(password, userCheck.password);
        if (!passwordMatch) {
            resModel.success = false;
            resModel.message = "Invalid Credentials";
            resModel.data = {};
            return res.status(400).json(resModel);
        }

        // Generate JWT token with role information
        const accessToken = await jwtService.issueJwtToken({
            email,
            id: userCheck._id,
            first_name: userCheck.first_name,
            role_id: userCheck.role_id
        });

        // Remove password from response
        userCheck.password = undefined;
        
        // Get user response object
        const userResponse = userCheck.toObject();
        
        // Check onboarding status for client users
        if (userResponse.role_id === '3') {
            const onboardingRecord = await Onboarding.findOne({ userId: userCheck._id });
            userResponse.onboarding_completed = onboardingRecord ? onboardingRecord.completed : false;
        } else {
            // Non-clients don't need onboarding
            userResponse.onboarding_completed = true;
        }

        resModel.success = true;
        resModel.message = "User Login Successfully";
        resModel.data = { token: accessToken, user: userResponse };
        res.status(200).json(resModel);

    } catch (error) {
        resModel.success = false;
        resModel.message = error.message;
        resModel.data = null;
        res.status(500).json(resModel);
    }
};


/**
 * @api {post} /api/role/add Add Role
 * @apiName Add Role
 * @apiGroup User
 * @apiBody {String} role Role.
 * @apiBody {String} id ID.
 * @apiDescription User Service...
 * @apiSampleRequest http://localhost:2001/api/role/add
 */
module.exports.addRole = async (req, res) => {
    try {
        const { role, id } = req.body;
        let roleInfo = {
            role: role.toLowerCase(),
            id: id
        }
        const newRole = new Role(roleInfo)
        let roleRes = await newRole.save();
        if (roleRes) {
            resModel.success = true;
            resModel.message = "Role Added Successfully";
            resModel.data = roleRes
            res.status(200).json(resModel)

        } else {
            resModel.success = false;
            resModel.message = "Error while creating Role";
            resModel.data = null;
            res.status(400).json(resModel);
        }

    } catch (error) {
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);

    }
}


module.exports.googleWithLogin = async (req, res) => {
    try {
        const { name, email, image } = req.body;
        const [firstName, lastName] = name.split(" ");
        const userCheck = await User.findOne({ email });
        if (userCheck) {
            const accessToken = await jwtService.issueJwtToken({ email, id: userCheck._id, name: userCheck?.first_name })
            
            // Remove password from response
            userCheck.password = undefined;
            
            // Get user response object and check onboarding status
            const userResponse = userCheck.toObject();
            if (userResponse.role_id === '3') {
                const onboardingRecord = await Onboarding.findOne({ userId: userCheck._id });
                userResponse.onboarding_completed = onboardingRecord ? onboardingRecord.completed : false;
            } else {
                userResponse.onboarding_completed = true;
            }
            
            resModel.success = true;
            resModel.message = "User Login Successfully";
            resModel.data = { token: accessToken, user: userResponse };
            res.status(200).json(resModel);
        } else {
            let userInfo = {
                first_name: firstName,
                last_name: lastName,
                profile: image,
                email: email.toLowerCase(),
                password: "",
                role_id: '3' // Client role for Google login
            }
            const newUser = new User(userInfo)
            let userCheck = await newUser.save();
            if (userCheck) {
                const accessToken = await jwtService.issueJwtToken({ email, id: userCheck._id })
                
                // Remove password from response
                userCheck.password = undefined;
                
                // Get user response object and add onboarding status
                const userResponse = userCheck.toObject();
                if (userResponse.role_id === '3') {
                    // New Google signups for clients will have onboarding_completed: false
                    userResponse.onboarding_completed = false;
                } else {
                    userResponse.onboarding_completed = true;
                }
                
                resModel.success = true;
                resModel.message = "User Login Successfully";
                resModel.data = { token: accessToken, user: userResponse };
                res.status(200).json(resModel);
            } else {
                resModel.success = false;
                resModel.message = "Something Went Wrong Please Try Again";
                resModel.data = null;
                res.status(400).json(resModel);
            }

        }
    } catch (error) {
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);

    }
}

/**
 * @api {get} /api/user/details/:id  Get User Details
 * @apiName Get User Details
 * @apiGroup User
 * @apiDescription User Service...
 * @apiSampleRequest http://localhost:2001/api/user/details/:id
 */
module.exports.getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing ID",
                data: null
            });
        }

        let user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User doesn't exist",
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: "User Details Found Successfully",
            data: user
        });

    } catch (error) {
        console.error("Error in getUserDetails:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
};

/**
 * @api {get} /api/user/getAllUser  Get All User
 * @apiName Get All User
 * @apiGroup User
 * @apiDescription User Service...
 * @apiSampleRequest http://localhost:2001/api/user/getAllUser
 */
module.exports.getAllUser = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        if (users) {
            resModel.success = true;
            resModel.message = "Get All Users Successfully";
            resModel.data = users;
            res.status(200).json(resModel);
        }
        else {
            resModel.success = true;
            resModel.message = "User Not Found";
            resModel.data = [];
            res.status(200).json(resModel)
        }
    } catch (error) {
        resModel.success = false;
        resModel.message = "Internal Server Error";
        resModel.data = null;
        res.status(500).json(resModel);
    }
}

/**
 * Get Current User Profile
 * GET /api/user/profile
 * Protected route - requires authentication
 */
module.exports.getCurrentUser = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Please login",
                data: null
            });
        }

        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        const userResponse = user.toObject();
        userResponse.profileSignedUrl = await buildProfileSignedUrl(userResponse.profile);

        return res.status(200).json({
            success: true,
            message: "User profile retrieved successfully",
            data: userResponse
        });

    } catch (error) {
        console.error("Error in getCurrentUser:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
}

/**
 * Update User Profile
 * PUT /api/user/profile/update
 * Protected route - requires authentication
 * Cannot update: email, password, role_id
 */
module.exports.updateUserProfile = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Please login",
                data: null
            });
        }

        // Extract only allowed fields for update
        const allowedUpdates = ['first_name', 'last_name', 'phoneNumber', 'dob', 'address', 'profile', 'plan'];
        const updates = {};
        
        // Only include fields that are in the request and are allowed
        for (const field of allowedUpdates) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        // Validate phone number if provided
        if (updates.phoneNumber) {
            const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
            if (!phoneRegex.test(updates.phoneNumber)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number format",
                    data: null
                });
            }
        }

        // Validate DOB if provided (should be in past)
        if (updates.dob) {
            const dobDate = new Date(updates.dob);
            if (dobDate > new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Date of birth cannot be in the future",
                    data: null
                });
            }
        }

        // Update user profile
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            {
                new: true,
                runValidators: true,
                select: '-password' // Exclude password from response
            }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: updatedUser
        });

    } catch (error) {
        console.error("Error in updateUserProfile:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
};

module.exports.updatePassword = async (req, res) => {
    console.log("Request body for updatePassword:", req.body);
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Please login",
                data: null
            });
        }

        const { currentPassword, newPassword, confirmPassword, confirmNewPassword } = req.body;
        const passwordConfirmation = confirmPassword || confirmNewPassword;

        if (!currentPassword || !newPassword || !passwordConfirmation) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
                data: null
            });
        }

        if (newPassword !== passwordConfirmation) {
            return res.status(400).json({
                success: false,
                message: "New password and confirm password do not match",
                data: null
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
                data: null
            });
        }

        // Get user with password
        const user = await User.findById(userId).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        // Compare current password
        const isMatch = await bcryptServices.comparePassword(
            currentPassword,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect",
                data: null
            });
        }

        // Hash new password
        const hashedPassword = await bcryptServices.generatePassword(newPassword);

        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully",
            data: null
        });

    } catch (error) {
        console.error("Error in changePassword:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
};








/**
 * Upload Profile Picture
 * POST /api/user/profile/upload-picture
 * Protected route - requires authentication
 */
module.exports.uploadProfilePicture = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Please login",
                data: null
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
                data: null
            });
        }

        const existingUser = await User.findById(userId).select('profile');
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        const oldProfileKey = extractProfileS3Key(existingUser.profile);

        const fileExtension = path.extname(req.file.originalname) || '';
        const fileKey = `profile-images/profile-${userId}-${Date.now()}${fileExtension}`;

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            })
        );
        const profilePictureSignedUrl = await buildProfileSignedUrl(fileKey);

        // Update user profile with new picture path
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { profile: fileKey } },
            {
                new: true,
                select: '-password'
            }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        if (oldProfileKey && oldProfileKey !== fileKey && isManagedProfileKey(oldProfileKey)) {
            try {
                await s3.send(
                    new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: oldProfileKey
                    })
                );
            } catch (deleteError) {
                console.error("Warning: failed to delete previous profile picture:", deleteError);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Profile picture updated successfully",
            data: {
                user: updatedUser,
                profilePicturePath: fileKey,
                profilePictureSignedUrl
            }
        });

    } catch (error) {
        console.error("Error in uploadProfilePicture:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
};

/**
 * Delete Profile Picture
 * DELETE /api/user/profile/picture
 * Protected route - requires authentication
 */
module.exports.deleteProfilePicture = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Please login",
                data: null
            });
        }

        const user = await User.findById(userId).select('profile');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
                data: null
            });
        }

        const oldProfileKey = extractProfileS3Key(user.profile);

        if (oldProfileKey && isManagedProfileKey(oldProfileKey)) {
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: oldProfileKey
                })
            );
        }

        await User.findByIdAndUpdate(
            userId,
            { $set: { profile: null } },
            { new: true, select: '-password' }
        );

        return res.status(200).json({
            success: true,
            message: "Profile picture deleted successfully",
            data: null
        });
    } catch (error) {
        console.error("Error in deleteProfilePicture:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            data: null
        });
    }
};
