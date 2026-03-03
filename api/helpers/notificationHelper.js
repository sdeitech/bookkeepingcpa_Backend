const notificationService = require('../services/notificationService');
const emailService = require('../services/email.service');

/**
 * Get email templates
 */
const {
  getTaskAssignedEmailTemplate,
  getDocumentUploadedEmailTemplate,
  getDocumentApprovedEmailTemplate,
  getDocumentRejectedEmailTemplate
} = require('./emailTemplates');

/**
 * Notify client when task is assigned
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} assignedBy - User who assigned the task
 */
async function notifyTaskAssigned(task, client, assignedBy) {
  try {
    // Create in-app notification
    await notificationService.createNotification({
      type: 'assignment',
      title: 'New Task Assigned',
      message: `You have been assigned a new task: ${task.title}`,
      recipientId: client._id,
      recipientRole: 'client',
      senderId: assignedBy._id,
      senderName: `${assignedBy.first_name} ${assignedBy.last_name}`,
      priority: 'medium',
      category: 'task',
      actionUrl: `/new-dashboard/tasks/${task._id}`,
      actionType: 'navigate',
      metadata: { taskId: task._id, taskTitle: task.title },
      channels: ['inApp'] // Email sent separately below
    });

    // Send email
    await emailService.sendEmail({
      to: client.email,
      subject: `New Task Assigned: ${task.title}`,
      html: getTaskAssignedEmailTemplate(task, client, assignedBy),
      text: `You have been assigned a new task: ${task.title}. Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Not set'}. Login to view details.`
    });

    console.log('✅ Task assigned notification sent to:', client.email);
  } catch (error) {
    console.error('❌ Error sending task assigned notification:', error);
    // Don't throw - notification failure shouldn't break the main flow
  }
}

/**
 * Notify staff when document is uploaded
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} staff - Staff user document
 */
async function notifyDocumentUploaded(document, task, client, staff) {
  try {
    // Notify assigned staff
    if (staff) {
      await notificationService.createNotification({
        type: 'document',
        title: 'New Document Uploaded',
        message: `${client.first_name} ${client.last_name} uploaded ${document.documentType.replace(/_/g, ' ')} for task: ${task.title}`,
        recipientId: staff._id,
        recipientRole: 'staff',
        senderId: client._id,
        senderName: `${client.first_name} ${client.last_name}`,
        priority: 'medium',
        category: 'task',
        actionUrl: `/staff/tasks/${task._id}`,
        actionType: 'navigate',
        metadata: { 
          taskId: task._id, 
          documentId: document._id,
          documentType: document.documentType 
        },
        channels: ['inApp']
      });

      await emailService.sendEmail({
        to: staff.email,
        subject: `Document Uploaded: ${document.documentType.replace(/_/g, ' ')}`,
        html: getDocumentUploadedEmailTemplate(document, task, client, staff),
        text: `${client.first_name} ${client.last_name} uploaded ${document.documentType.replace(/_/g, ' ')} for task "${task.title}". Login to review.`
      });

      console.log('✅ Document uploaded notification sent to:', staff.email);
    }
  } catch (error) {
    console.error('❌ Error sending document uploaded notification:', error);
  }
}

/**
 * Notify client when document is approved
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} reviewer - User who approved the document
 */
async function notifyDocumentApproved(document, task, client, reviewer) {
  try {
    await notificationService.createNotification({
      type: 'document',
      title: 'Document Approved',
      message: `Your ${document.documentType.replace(/_/g, ' ')} for task "${task.title}" has been approved`,
      recipientId: client._id,
      recipientRole: 'client',
      senderId: reviewer._id,
      senderName: `${reviewer.first_name} ${reviewer.last_name}`,
      priority: 'low',
      category: 'task',
      actionUrl: `/new-dashboard/tasks/${task._id}`,
      actionType: 'navigate',
      metadata: { 
        taskId: task._id, 
        documentId: document._id,
        documentType: document.documentType 
      },
      channels: ['inApp']
    });

    await emailService.sendEmail({
      to: client.email,
      subject: `Document Approved: ${document.documentType.replace(/_/g, ' ')}`,
      html: getDocumentApprovedEmailTemplate(document, task, client, reviewer),
      text: `Your ${document.documentType.replace(/_/g, ' ')} has been approved. ${document.reviewNotes || ''}`
    });

    console.log('✅ Document approved notification sent to:', client.email);
  } catch (error) {
    console.error('❌ Error sending document approved notification:', error);
  }
}

/**
 * Notify client when document is rejected
 * @param {Object} document - TaskDocument document
 * @param {Object} task - Task document
 * @param {Object} client - Client user document
 * @param {Object} reviewer - User who rejected the document
 * @param {String} reason - Rejection reason
 */
async function notifyDocumentRejected(document, task, client, reviewer, reason) {
  try {
    await notificationService.createNotification({
      type: 'alert',
      title: 'Document Rejected',
      message: `Your ${document.documentType.replace(/_/g, ' ')} for task "${task.title}" needs revision. Reason: ${reason}`,
      recipientId: client._id,
      recipientRole: 'client',
      senderId: reviewer._id,
      senderName: `${reviewer.first_name} ${reviewer.last_name}`,
      priority: 'high',
      category: 'alert',
      actionUrl: `/new-dashboard/tasks/${task._id}`,
      actionType: 'navigate',
      metadata: { 
        taskId: task._id, 
        documentId: document._id,
        documentType: document.documentType,
        rejectionReason: reason 
      },
      channels: ['inApp']
    });

    await emailService.sendEmail({
      to: client.email,
      subject: `Document Rejected: ${document.documentType.replace(/_/g, ' ')}`,
      html: getDocumentRejectedEmailTemplate(document, task, client, reviewer, reason),
      text: `Your ${document.documentType.replace(/_/g, ' ')} was rejected. Reason: ${reason}. Please upload a revised version.`
    });

    console.log('✅ Document rejected notification sent to:', client.email);
  } catch (error) {
    console.error('❌ Error sending document rejected notification:', error);
  }
}

/**
 * Notify user about new message on task
 * @param {Object} task - Task object
 * @param {Object} message - Message object
 * @param {Object} sender - Sender user object
 * @param {Object} recipient - Recipient user object
 */
async function notifyNewMessage(task, message, sender, recipient) {
  try {
    const senderName = `${sender.first_name} ${sender.last_name}`;
    const recipientId = recipient._id;

    // Truncate message for preview (first 100 chars)
    const messagePreview = message.message.length > 100 
      ? message.message.substring(0, 100) + '...' 
      : message.message;

    // Determine action URL based on recipient role
    let actionUrl = `/admin/tasks/${task._id}`;
    if (recipient.role_id === '2') {
      actionUrl = `/staff/tasks/${task._id}`;
    } else if (recipient.role_id === '3') {
      actionUrl = `/new-dashboard/tasks/${task._id}`;
    }

    // Create in-app notification
    await notificationService.createNotification({
      userId: recipientId,
      type: 'message',
      priority: 'normal',
      title: `New message on ${task.title}`,
      message: `${senderName}: ${messagePreview}`,
      actionUrl,
      metadata: {
        taskId: task._id.toString(),
        messageId: message._id.toString(),
        senderId: sender._id.toString()
      }
    });

    console.log(`✅ Message notification sent to user ${recipientId}`);
    return { success: true };
  } catch (error) {
    console.error('Error in notifyNewMessage:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  notifyTaskAssigned,
  notifyDocumentUploaded,
  notifyDocumentApproved,
  notifyDocumentRejected,
  notifyNewMessage
};
