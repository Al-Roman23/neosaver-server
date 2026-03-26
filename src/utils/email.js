// This File Handles The Email Sending System Via Brevo Api
const axios = require("axios");
const logger = require("./logger");

// This Sends A Password Reset Email To The User Using Brevo Http API
async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
  const apiKey = process.env.BREVO_API_KEY;

  const emailData = {
    sender: {
      name: "Neo Saver",
      email: process.env.EMAIL_USER,
    },
    to: [
      {
        email: toEmail,
      },
    ],
    subject: "Password Reset Request",
    htmlContent: `
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

  try {
    await axios.post("https://api.brevo.com/v3/smtp/email", emailData, {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    logger.info({ toEmail }, "Password Reset Email Sent Successfully Via Brevo API!");
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    logger.error({ error: errorData, toEmail }, "Failed To Send Password Reset Email Via Brevo!");
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail,
};
