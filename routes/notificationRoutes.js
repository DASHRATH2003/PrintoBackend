import express from 'express';
import Notification from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all notifications for admin
router.get('/admin', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = {
      $or: [
        { recipientType: 'admin' },
        { recipientType: 'all' }
      ]
    };

    // Add type filter if specified
    if (req.query.type) {
      filter.type = req.query.type;
    }

    // Add read status filter if specified
    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === 'true';
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .lean();

    console.log('📋 Found notifications:', notifications.length);
    console.log('📄 Notifications data:', notifications.map(n => ({
      id: n._id,
      title: n.title,
      recipientType: n.recipientType,
      recipientId: n.recipientId
    })));

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false
    });

    console.log('📊 Total notifications:', total, 'Unread:', unreadCount);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: notifications.length,
          totalCount: total
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

// Get unread count for admin
router.get('/admin/unread-count', authenticateToken, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      $or: [
        { recipientType: 'admin' },
        { recipientType: 'all' }
      ],
      isRead: false
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message
    });
  }
});

// Get all notifications for seller
router.get('/seller', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Seller notification request - User:', req.user);
    
    // Verify user is a seller
    if (req.user.role !== 'seller') {
      console.log('❌ Access denied - User role:', req.user.role);
      return res.status(403).json({
        success: false,
        message: 'Seller access required'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = {
      $or: [
        { recipientType: 'seller', recipientId: req.user.userId },
        { recipientType: 'all' }
      ]
    };
    
    console.log('🔍 Notification filter:', JSON.stringify(filter, null, 2));

    // Add type filter if specified
    if (req.query.type) {
      filter.type = req.query.type;
    }

    // Add read status filter if specified
    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === 'true';
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .lean();

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: notifications.length,
          totalCount: total
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching seller notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

// Get unread count for seller
router.get('/seller/unread-count', authenticateToken, async (req, res) => {
  try {
    // Verify user is a seller
    if (req.user.role !== 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Seller access required'
      });
    }

    const unreadCount = await Notification.countDocuments({
      $or: [
        { recipientType: 'seller', recipientId: req.user.userId },
        { recipientType: 'all' }
      ],
      isRead: false
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error fetching seller unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message
    });
  }
});

// Mark all notifications as read for seller
router.patch('/seller/mark-all-read', authenticateToken, async (req, res) => {
  try {
    // Verify user is a seller
    if (req.user.role !== 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Seller access required'
      });
    }

    const result = await Notification.updateMany(
      {
        $or: [
          { recipientType: 'seller', recipientId: req.user.userId },
          { recipientType: 'all' }
        ],
        isRead: false
      },
      { isRead: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking all seller notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
});

// Delete all read notifications for seller
router.delete('/seller/clear-read', authenticateToken, async (req, res) => {
  try {
    // Verify user is a seller
    if (req.user.role !== 'seller') {
      return res.status(403).json({
        success: false,
        message: 'Seller access required'
      });
    }

    const result = await Notification.deleteMany({
      $or: [
        { recipientType: 'seller', recipientId: req.user.userId },
        { recipientType: 'all' }
      ],
      isRead: true
    });

    res.json({
      success: true,
      message: `${result.deletedCount} read notifications cleared`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Error clearing seller read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear read notifications',
      error: error.message
    });
  }
});

// Create new notification
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'info',
      priority = 'medium',
      recipientType = 'admin',
      recipientId,
      relatedEntity,
      actionUrl,
      metadata,
      expiresAt
    } = req.body;

    const notification = new Notification({
      title,
      message,
      type,
      priority,
      recipientType,
      recipientId,
      relatedEntity,
      actionUrl,
      metadata,
      expiresAt,
      createdBy: req.user.id,
      createdByModel: req.user.role === 'admin' ? 'Admin' : 'User'
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
});

// Mark all notifications as read for admin
router.patch('/admin/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        $or: [
          { recipientType: 'admin' },
          { recipientType: 'all' }
        ],
        isRead: false
      },
      { isRead: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
});

// Delete all read notifications for admin
router.delete('/admin/clear-read', authenticateToken, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      $or: [
        { recipientType: 'admin' },
        { recipientType: 'all' }
      ],
      isRead: true
    });

    res.json({
      success: true,
      message: `${result.deletedCount} read notifications cleared`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear read notifications',
      error: error.message
    });
  }
});

export default router;