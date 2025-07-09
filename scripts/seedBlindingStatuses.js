const mongoose = require("mongoose")
const BlindingStatus = require("../models/BlindingStatus")
require("dotenv").config()

const blindingStatuses = [
  {
    status_name: "Single Blind",
    description: "Participants are unaware of their treatment assignment",
    is_active: true,
  },
  {
    status_name: "Double Blind",
    description: "Both participants and investigators are unaware of treatment assignment",
    is_active: true,
  },
  {
    status_name: "Triple Blind",
    description: "Participants, investigators, and data analysts are unaware of treatment assignment",
    is_active: true,
  },
  {
    status_name: "Open Label",
    description: "All parties are aware of the treatment assignment",
    is_active: true,
  },
  {
    status_name: "Unblinded",
    description: "No blinding is applied to the study",
    is_active: true,
  },
]

async function seedBlindingStatuses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Clear existing blinding statuses
    await BlindingStatus.deleteMany({})
    console.log("Cleared existing blinding statuses")

    // Insert new blinding statuses
    await BlindingStatus.insertMany(blindingStatuses)
    console.log("Blinding statuses seeded successfully")

    process.exit(0)
  } catch (error) {
    console.error("Error seeding blinding statuses:", error)
    process.exit(1)
  }
}

seedBlindingStatuses()
