const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'hr_officer', 'super_admin', 'hr', 'superadmin'],
      default: 'student',
      index: true,
    },
    studentId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    academicYear: {
      type: String,
      enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate', 'Staff/N/A'],
      default: 'Staff/N/A',
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    accountStatus: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'locked'],
      default: 'active',
      index: true,
    },
    // Backwards compatibility alias for status
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'locked'],
      default: 'active',
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook: normalize legacy role and status values
userSchema.pre('validate', function () {
  if (this.role === 'hr') this.role = 'hr_officer';
  if (this.role === 'superadmin') this.role = 'super_admin';
  if (this.status && !this.accountStatus) this.accountStatus = this.status;
  if (this.accountStatus && !this.status) this.status = this.accountStatus;
});

// Hash password before saving
userSchema.pre('save', async function () {
  // Sync status and accountStatus
  if (this.isModified('accountStatus')) {
    this.status = this.accountStatus;
  } else if (this.isModified('status')) {
    this.accountStatus = this.status;
  }

  // Normalize role
  if (this.role === 'hr') this.role = 'hr_officer';
  if (this.role === 'superadmin') this.role = 'super_admin';

  if (!this.isModified('password') && !this.isModified('passwordHash')) return;

  const rawPassword = this.password || this.passwordHash;
  // If not already bcrypt hashed
  if (rawPassword && !rawPassword.startsWith('$2a$') && !rawPassword.startsWith('$2b$')) {
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(rawPassword, salt);
    this.password = hash;
    this.passwordHash = hash;
  } else if (this.password && !this.passwordHash) {
    this.passwordHash = this.password;
  }
});

// Compare password helper
userSchema.methods.comparePassword = async function (candidatePassword) {
  const hash = this.password || this.passwordHash;
  if (!hash) return false;
  return await bcrypt.compare(candidatePassword, hash);
};

// Account lock helpers
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incFailedLoginAttempts = async function () {
  // Reset attempts if previous lock expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
    this.accountStatus = 'active';
    this.status = 'active';
    return await this.save();
  }

  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  // Lock account after 5 consecutive failed attempts for 15 minutes
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    this.accountStatus = 'locked';
    this.status = 'locked';
  }
  return await this.save();
};

userSchema.methods.resetFailedAttempts = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = null;
  if (this.accountStatus === 'locked') {
    this.accountStatus = 'active';
    this.status = 'active';
  }
  return await this.save();
};

module.exports = mongoose.model('User', userSchema);
