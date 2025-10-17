import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'order', 'seller', 'product'],
    default: 'info'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  recipientType: {
    type: String,
    enum: ['admin', 'seller', 'user', 'all'],
    default: 'admin'
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    enum: ['User', 'Seller', 'Admin']
  },
  relatedEntity: {
    entityType: {
      type: String,
      enum: ['order', 'product', 'seller', 'user', 'payment']
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  actionUrl: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  expiresAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'createdByModel'
  },
  createdByModel: {
    type: String,
    enum: ['User', 'Seller', 'Admin', 'System'],
    default: 'System'
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ recipientType: 1, recipientId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1, priority: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for formatted creation date
notificationSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Static method to create notification
notificationSchema.statics.createNotification = async function(data) {
  try {
    const notification = new this(data);
    await notification.save();
    return notification;
  } catch (error) {
    throw new Error(`Failed to create notification: ${error.message}`);
  }
};

// Static method to mark as read
notificationSchema.statics.markAsRead = async function(notificationId, recipientId) {
  try {
    return await this.findOneAndUpdate(
      { _id: notificationId, recipientId: recipientId },
      { isRead: true },
      { new: true }
    );
  } catch (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function(recipientType, recipientId) {
  try {
    return await this.countDocuments({
      recipientType: recipientType,
      recipientId: recipientId,
      isRead: false
    });
  } catch (error) {
    throw new Error(`Failed to get unread count: ${error.message}`);
  }
};

export default mongoose.model('Notification', notificationSchema);