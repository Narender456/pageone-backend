const nodemailer = require("nodemailer")

const sendEmail = async (options) => {
  // Create transporter
  const transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })

  // Define email options
  const mailOptions = {
    from: `${process.env.FROM_NAME || "Admin Dashboard"} <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  }

  // Send email
  const info = await transporter.sendMail(mailOptions)
  console.log("Message sent: %s", info.messageId)
}

module.exports = { sendEmail }
