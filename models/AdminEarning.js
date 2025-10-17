import mongoose from 'mongoose';

const adminEarningSchema = new mongoose.Schema({
  range: { type: String, enum: ['week', 'month', 'year'], default: 'month' },
  params: {
    weeks: { type: Number, default: 8 },
    months: { type: Number, default: 12 },
    years: { type: Number, default: 3 }
  },
  totals: {
    earned: { type: Number, default: 0 },
    upcoming: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    ordersCount: { type: Number, default: 0 }
  },
  breakdown: [
    {
      label: { type: String },
      earned: { type: Number, default: 0 },
      upcoming: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      from: { type: Date },
      to: { type: Date }
    }
  ]
}, { timestamps: true, collection: 'adminEarnings' });

const AdminEarning = mongoose.model('AdminEarning', adminEarningSchema);
export default AdminEarning;