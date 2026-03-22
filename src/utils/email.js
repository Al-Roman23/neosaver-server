// This File Handles The Email Sending System
const nodemailer = require("nodemailer");
const logger = require("./logger");

// Create Reusable Transporter Using Gmail Smtp
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify Transporter Connection On Startup
transporter.verify((error) => {
  if (error) {
    logger.error({ error }, "Email Transporter Connection Failed!");
  }
});

// Send Password Reset Email
async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  const mailOptions = {
    from: `"Neo Saver" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #d32f2f;">Neo Saver</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <a href="${resetLink}"
          style="display: inline-block; background-color: #d32f2f; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
          Reset Password
        </a>
        <p>This link will expire in <strong>1 hour</strong>.</p>
        <p>If you did not request a password reset, please ignore this email. Your password will not change.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">Neo Saver &mdash; Sent Automatically, Do Not Reply.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  logger.info({ toEmail }, "Password Reset Email Sent Successfully!");
}

module.exports = { sendPasswordResetEmail };
