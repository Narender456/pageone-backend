const User = require("../models/User")

exports.createDefaultAdmin = async () => {
  try {
    // Check if admin already exists
    const adminExists = await User.findOne({
      email: process.env.ADMIN_EMAIL || "admin@example.com",
    })

    if (adminExists) {
      console.log("Default admin user already exists")
      return
    }

    // Create default admin user
    const admin = await User.create({
      name: "Admin User",
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: process.env.ADMIN_PASSWORD || "admin123",
      role: "admin",
      hasAccess: true,
      isEmailVerified: true,
    })

    console.log("Default admin user created:", admin.email)
  } catch (error) {
    console.error("Error creating default admin:", error)
  }
}
