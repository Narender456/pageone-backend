const mongoose = require("mongoose")

const formSubmissionSchema = new mongoose.Schema(
  {
    form: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Form",
      required: true,
    },
    title: {
      type: String,
      default: "Untitled Form",
      maxlength: [255, "Title cannot exceed 255 characters"],
    },
    category: {
      type: String,
      default: "Uncategorized",
      maxlength: [255, "Category cannot exceed 255 characters"],
    },
    data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      required: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index for better performance
formSubmissionSchema.index({ slug: 1 })
formSubmissionSchema.index({ uniqueId: 1 })
formSubmissionSchema.index({ submittedBy: 1 })
formSubmissionSchema.index({ createdAt: -1 })

// Pre-save middleware to generate slug and uniqueId
formSubmissionSchema.pre("save", async function (next) {
  const { generateSlugWithUuid } = require("../utils/FR_utils")

  try {
    // Generate or reuse uniqueId
    if (!this.uniqueId) {
      this.uniqueId = require("uuid").v4().split("-")[4]
    }

    // Only generate a slug if it doesn't exist or is set to a default
    if (!this.slug || this.slug === "default-form-title") {
      const { uniqueId, slug } = generateSlugWithUuid(this.title, this.uniqueId)
      this.slug = slug
    }

    next()
  } catch (error) {
    next(error)
  }
})

module.exports = mongoose.model("FormSubmission", formSubmissionSchema)
