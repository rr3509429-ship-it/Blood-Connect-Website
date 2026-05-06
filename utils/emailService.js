// backend/utils/emailService.js
const nodemailer = require('nodemailer');

// Create transporter using Gmail SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use Gmail App Password
    },
  });
};

// Send OTP verification email
const sendOTPEmail = async (email, name, otp) => {
  const transporter = createTransporter();
  const mailOptions = {
    from: `"Smart Blood Donation" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🩸 Verify Your Email - Smart Blood Donation System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #d32f2f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">🩸 Smart Blood Donation</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello, ${name}!</h2>
          <p style="color: #555; font-size: 16px;">Thank you for registering. Please verify your email address using the OTP below:</p>
          <div style="background: #d32f2f; color: white; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 10px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #888; font-size: 14px;">⏰ This OTP expires in <strong>10 minutes</strong>.</p>
          <p style="color: #888; font-size: 14px;">If you did not create this account, please ignore this email.</p>
        </div>
        <div style="background: #d32f2f; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="color: white; margin: 0; font-size: 12px;">© 2024 Smart Blood Donation System. Saving Lives Together.</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`❌ Email send failed: ${err.message}`);
    return false;
  }
};

// Send password reset OTP email
const sendPasswordResetEmail = async (email, name, otp) => {
  const transporter = createTransporter();
  const mailOptions = {
    from: `"Smart Blood Donation" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset OTP - Smart Blood Donation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
        <div style="background: #d32f2f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">🩸 Password Reset Request</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello, ${name}!</h2>
          <p style="color: #555; font-size: 16px;">Use the code below to reset your BloodConnect password. It expires in 5 minutes.</p>
          <div style="background: #d32f2f; color: white; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 10px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #888; font-size: 14px;">If you did not request this change, please ignore this email.</p>
        </div>
        <div style="background: #d32f2f; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="color: white; margin: 0; font-size: 12px;">© Smart Blood Donation System.</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`❌ Email send failed: ${err.message}`);
    return false;
  }
};

// Send donation notification to donor
const sendDonorNotification = async (donorEmail, donorName, requestDetails) => {
  const transporter = createTransporter();
  const mailOptions = {
    from: `"Smart Blood Donation" <${process.env.EMAIL_USER}>`,
    to: donorEmail,
    subject: '🆘 Urgent: Blood Donation Request Matched to You',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #d32f2f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">🩸 Blood Needed!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Dear ${donorName},</h2>
          <p>A blood request has been matched to your profile. Your donation can save a life!</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 10px; background: #fff; border: 1px solid #ddd;"><strong>Blood Group</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${requestDetails.blood_group}</td></tr>
            <tr><td style="padding: 10px; background: #fff; border: 1px solid #ddd;"><strong>City</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${requestDetails.city}</td></tr>
            <tr><td style="padding: 10px; background: #fff; border: 1px solid #ddd;"><strong>Emergency</strong></td><td style="padding: 10px; border: 1px solid #ddd; color: ${requestDetails.isEmergency ? '#d32f2f' : '#333'}">${requestDetails.isEmergency ? '🚨 YES - URGENT' : 'No'}</td></tr>
          </table>
          <p>Please log in to the system to accept or decline this request.</p>
        </div>
      </div>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error(`Email error: ${err.message}`);
    return false;
  }
};

module.exports = { sendOTPEmail, sendPasswordResetEmail, sendDonorNotification };
