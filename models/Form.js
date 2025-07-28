const mongoose = require("mongoose")

const formSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "Untitled Form",
      maxlength: [255, "Title cannot exceed 255 characters"],
    },
    category: {
      type: String,
      maxlength: [100, "Category cannot exceed 100 characters"],
    },
    content: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: Number,
      default: 1,
    },
    phase: {
      type: String,
      enum: ["development", "testing", "migration"],
      default: "development",
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    sites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Site",
      },
    ],
    stages: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stage",
      required: true,
    },
    uniqueId: {
      type: String,
      unique: true,
      maxlength: [100, "UniqueId cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      unique: true,
      maxlength: [500, "Slug cannot exceed 500 characters"],
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index for better performance
formSchema.index({ slug: 1 })
formSchema.index({ uniqueId: 1 })
formSchema.index({ phase: 1 })

// Pre-save middleware to generate slug and uniqueId
formSchema.pre("save", async function (next) {
  const { generateSlugWithUuid } = require("../utils/FR_utils")

  try {
    // Ensure uniqueId is set
    if (!this.uniqueId) {
      this.uniqueId = require("uuid").v4().split("-")[4]
    }

    // Only generate or overwrite slug if it's empty or 'default-form-title'
    if (!this.slug || this.slug === "default-form-title") {
      const { uniqueId, slug } = generateSlugWithUuid(this.title, this.uniqueId)
      this.slug = slug
    }

    next()
  } catch (error) {
    next(error)
  }
})

module.exports = mongoose.model("Form", formSchema)
