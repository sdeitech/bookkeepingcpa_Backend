/**
 * Script to create a super admin user
 * Run this script with: node scripts/seedAdmin.js
 */

require('dotenv').config({ path: '.env.dev' });
const mongoose = require('mongoose');
const bcryptService = require('../api/services/bcrypt.services');
const User = require('../api/models/userModel');
const Role = require('../api/models/roleModel');

// Super Admin credentials
const SUPER_ADMIN = {
    email: 'admin@plutify.com',
    password: 'admin@123',
    first_name: 'Super',
    last_name: 'Admin',
    role_id: '1'
};

async function seedSuperAdmin() {
    try {
        // Connect to MongoDB
        const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/plutify_db';
        await mongoose.connect(dbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Check if roles exist, if not create them
        const roles = [
            { id: 1, role: 'superadmin' },
            { id: 2, role: 'staff' },
            { id: 3, role: 'client' }
        ];

        for (const roleData of roles) {
            const existingRole = await Role.findOne({ id: roleData.id });
            if (!existingRole) {
                const newRole = new Role(roleData);
                await newRole.save();
                console.log(`Created role: ${roleData.role}`);
            }
        }

        // Check if super admin already exists
        const existingAdmin = await User.findOne({ email: SUPER_ADMIN.email });
        
        if (existingAdmin) {
            console.log('Super Admin already exists with email:', SUPER_ADMIN.email);
            
            // Update the existing admin to ensure they have super admin role
            if (existingAdmin.role_id !== '1') {
                existingAdmin.role_id = '1';
                await existingAdmin.save();
                console.log('Updated existing user to Super Admin role');
            }
        } else {
            // Hash the password
            const passwordHash = await bcryptService.generatePassword(SUPER_ADMIN.password);
            
            // Create super admin user
            const adminUser = new User({
                email: SUPER_ADMIN.email,
                password: passwordHash,
                first_name: SUPER_ADMIN.first_name,
                last_name: SUPER_ADMIN.last_name,
                role_id: SUPER_ADMIN.role_id,
                active: true
            });
            
            await adminUser.save();
            console.log('Super Admin created successfully!');
            console.log('Email:', SUPER_ADMIN.email);
            console.log('Password:', SUPER_ADMIN.password);
            console.log('Please change the password after first login');
        }

        // Close database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
        
    } catch (error) {
        console.error('Error seeding super admin:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the seed function
seedSuperAdmin();