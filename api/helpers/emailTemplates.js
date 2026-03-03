/**
 * Email Templates for Notifications
 * Branded HTML templates for notification emails
 */

/**
 * Task Assigned Email Template
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} assignedBy - User who assigned the task
 * @returns {String} HTML email template
 */
function getTaskAssignedEmailTemplate(task, client, assignedBy) {
  const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }) : 'Not set';

  const requiredDocsHtml = task.requiredDocuments && task.requiredDocuments.length > 0
    ? `<p><strong>Required Documents:</strong></p>
       <ul style="margin: 10px 0; padding-left: 20px;">
         ${task.requiredDocuments.map(doc => 
           `<li>${doc.type.replace(/_/g, ' ')}${doc.isRequired ? ' <span style="color: #f44336;">(Required)</span>' : ''}</li>`
         ).join('')}
       </ul>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Task Assigned</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .task-card { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #667eea; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        .priority-high { border-left-color: #f44336; }
        .priority-urgent { border-left-color: #ff5722; }
        h1 { margin: 0; font-size: 24px; }
        h2 { margin: 0 0 10px 0; font-size: 20px; color: #333; }
        p { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 New Task Assigned</h1>
        </div>
        <div class="content">
          <p>Hello ${client.first_name},</p>
          <p>You have been assigned a new task by ${assignedBy.first_name} ${assignedBy.last_name}.</p>
          
          <div class="task-card ${task.priority === 'HIGH' || task.priority === 'URGENT' ? 'priority-' + task.priority.toLowerCase() : ''}">
            <h2>${task.title}</h2>
            <p><strong>Description:</strong> ${task.description || 'No description provided'}</p>
            <p><strong>Due Date:</strong> ${dueDate}</p>
            <p><strong>Priority:</strong> ${task.priority || 'MEDIUM'}</p>
            ${requiredDocsHtml}
          </div>
          
          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/new-dashboard/tasks/${task._id}" class="button">View Task Details</a>
          </center>
          
          <p>Please login to your dashboard to view the complete task details and upload any required documents.</p>
          
          <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Bookkeeping CPA'} Team</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Document Uploaded Email Template
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} staff - Staff user document
 * @returns {String} HTML email template
 */
function getDocumentUploadedEmailTemplate(document, task, client, staff) {
  const uploadedDate = new Date(document.createdAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Document Uploaded</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .doc-card { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #2196F3; }
        .button { display: inline-block; background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        h1 { margin: 0; font-size: 24px; }
        h3 { margin: 0 0 15px 0; font-size: 18px; color: #333; }
        p { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📄 New Document Uploaded</h1>
        </div>
        <div class="content">
          <p>Hello ${staff.first_name},</p>
          <p>${client.first_name} ${client.last_name} has uploaded a new document for review.</p>
          
          <div class="doc-card">
            <h3>Document Details</h3>
            <p><strong>Document Type:</strong> ${document.documentType.replace(/_/g, ' ')}</p>
            <p><strong>File Name:</strong> ${document.originalName}</p>
            <p><strong>Task:</strong> ${task.title}</p>
            <p><strong>Client:</strong> ${client.first_name} ${client.last_name}</p>
            <p><strong>Uploaded:</strong> ${uploadedDate}</p>
          </div>
          
          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/staff/tasks/${task._id}" class="button">Review Document</a>
          </center>
          
          <p>Please review the document and approve or reject it with feedback.</p>
          
          <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Bookkeeping CPA'} Team</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Document Approved Email Template
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} reviewer - User who approved the document
 * @returns {String} HTML email template
 */
function getDocumentApprovedEmailTemplate(document, task, client, reviewer) {
  const approvedDate = new Date(document.reviewedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const notesHtml = document.reviewNotes 
    ? `<p><strong>Notes:</strong> ${document.reviewNotes}</p>` 
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document Approved</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .success-card { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #4CAF50; }
        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        h1 { margin: 0; font-size: 24px; }
        h3 { margin: 0 0 15px 0; font-size: 18px; color: #333; }
        p { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Document Approved</h1>
        </div>
        <div class="content">
          <p>Hello ${client.first_name},</p>
          <p>Great news! Your document has been approved by ${reviewer.first_name} ${reviewer.last_name}.</p>
          
          <div class="success-card">
            <h3>Approved Document</h3>
            <p><strong>Document Type:</strong> ${document.documentType.replace(/_/g, ' ')}</p>
            <p><strong>Task:</strong> ${task.title}</p>
            <p><strong>Approved By:</strong> ${reviewer.first_name} ${reviewer.last_name}</p>
            <p><strong>Approved On:</strong> ${approvedDate}</p>
            ${notesHtml}
          </div>
          
          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/new-dashboard/tasks/${task._id}" class="button">View Task</a>
          </center>
          
          <p>Thank you for your submission!</p>
          
          <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Bookkeeping CPA'} Team</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Document Rejected Email Template
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} reviewer - User who rejected the document
 * @param {String} reason - Rejection reason
 * @returns {String} HTML email template
 */
function getDocumentRejectedEmailTemplate(document, task, client, reviewer, reason) {
  const rejectedDate = new Date(document.reviewedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document Needs Revision</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert-card { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #f44336; }
        .reason-box { background: #ffebee; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 3px solid #f44336; }
        .button { display: inline-block; background: #f44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        h1 { margin: 0; font-size: 24px; }
        h3 { margin: 0 0 15px 0; font-size: 18px; color: #333; }
        p { margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Document Needs Revision</h1>
        </div>
        <div class="content">
          <p>Hello ${client.first_name},</p>
          <p>Your document has been reviewed by ${reviewer.first_name} ${reviewer.last_name} and requires revision.</p>
          
          <div class="alert-card">
            <h3>Document Details</h3>
            <p><strong>Document Type:</strong> ${document.documentType.replace(/_/g, ' ')}</p>
            <p><strong>Task:</strong> ${task.title}</p>
            <p><strong>Reviewed By:</strong> ${reviewer.first_name} ${reviewer.last_name}</p>
            <p><strong>Reviewed On:</strong> ${rejectedDate}</p>
            
            <div class="reason-box">
              <strong>Reason for Rejection:</strong>
              <p style="margin: 10px 0 0 0;">${reason}</p>
            </div>
          </div>
          
          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/new-dashboard/tasks/${task._id}" class="button">Upload Revised Document</a>
          </center>
          
          <p>Please review the feedback above and upload a revised version of the document.</p>
          
          <p>If you have any questions, please don't hesitate to reach out to your assigned staff member.</p>
          
          <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Bookkeeping CPA'} Team</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${process.env.COMPANY_NAME || 'Bookkeeping CPA'}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  getTaskAssignedEmailTemplate,
  getDocumentUploadedEmailTemplate,
  getDocumentApprovedEmailTemplate,
  getDocumentRejectedEmailTemplate
};
