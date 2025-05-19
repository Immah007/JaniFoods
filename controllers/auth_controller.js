const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../services/db');
const { COOKIE_NAME, ADMIN_AUTH, DELIVERY_AUTH, JWT_SECRET } = require('../middleware/auth');
const nodemailer = require('nodemailer');
//const { useId } = require('react');


// Configure Nodemailer with Zoho SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: 'no-reply@shopjani.com',
    pass: 'yqY7xb#007',
  },
});

// Helper function to generate OTP
const generateOTP = () => {
  return Math.floor(10000 + Math.random() * 90000).toString();
};


const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(502).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const signup = async (req, res) => {
  const { firstName, lastName, email, telephone, password } = req.body;

  try {
    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Helper function to generate 7-character alphanumeric ID
    function generateUserId() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }


    // Generate unique user ID
    let userId;
    let isUnique = false;

    while (!isUnique) {
      userId = generateUserId();
      const idCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (idCheck.rows.length === 0) {
        isUnique = true;
      }
    }




    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (id, firstname, lastname, email, telephone, password, role) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [userId, firstName, lastName, email, telephone, hashedPassword, 'customer']
    );

    // Generate verification token
    const verificationToken = jwt.sign(
      { email: newUser.rows[0].email },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Send verification email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to JaniFoods',
      html: `Thank you ${firstName} for choosing JaniFoods. We hope you will love it here. Click <a href="https://janifoods.onrender.com">here</a> to try out our authentic menu with great discounts! `,
    // html: `<p>Please click <a href="${process.env.BASE_URL}/verify-email?token=${verificationToken}">here</a> to verify your email.</p>`
    };

    await transporter.sendMail(mailOptions);
    


     const token = jwt.sign(
      {
        id: userId,
        email: email,
        firstname: firstName,
        lastname: lastName,
        role: 'customer'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );


    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });
    res.status(201).json({
      success: true,
      message: 'User created successfully. Please check your email for verification.'
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const emailConfirm = async (req, res) => {
  const { token } = req.query;

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Update user as verified
    await pool.query('UPDATE users SET verified = true WHERE email = $1', [decoded.email]);

    res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(400).json({ error: 'Invalid or expired token' });
  } 
  console.log('Email confirm')
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Store OTP in database
    await pool.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expiry = $2 WHERE email = $3',
      [otp, otpExpiry, email]
    );

    // Send OTP email
    const mailOptions = {
      from: 'no-reply@shopjani.com',  //process.env.EMAIL_USER,
      to: 'nuelemman980@gmail.com',   //email,
      subject: 'Password Reset OTP',
      html: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It expires in 15 minutes.</p>`
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'OTP sent to email',
      email: email
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const passwordResetOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Verify OTP
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND reset_otp = $2 AND reset_otp_expiry > NOW()',
      [email, otp]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { email, id: userResult.rows[0].id },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({
      success: true,
      message: 'OTP verified',
      token: resetToken
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const passwordReset = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, reset_otp = NULL, reset_otp_expiry = NULL WHERE id = $2',
      [hashedPassword, decoded.id]
    );

    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(400).json({ error: 'Invalid or expired token' });
  }
};


const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(502).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie(ADMIN_AUTH, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deliveryLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(502).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie(DELIVERY_AUTH, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const logout = (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
};

const authStatus = (req, res) => {
  res.json({
    isAuthenticated: true,
    user: req.user
  });
};

module.exports = {
  login,
  signup,
  emailConfirm,
  forgotPassword,
  passwordResetOTP,
  passwordReset,
  adminLogin,
  deliveryLogin,
  logout,
  authStatus
};
