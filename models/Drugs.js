const mongoose = require("mongoose")
const { Schema } = mongoose

// Utility function for generating slug with UUID
const generateSlugWithUUID = (text, existingUniqueId = null) => {
  const crypto = require("crypto")

  // Generate slug from text
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens

  // Generate or use existing unique ID
  const uniqueId = existingUniqueId || crypto.randomBytes(8).toString("hex")

  return {
    uniqueId,
    slug: `${slug}-${uniqueId}`,
  }
}

const drugsSchema = new Schema(
  {
    drug_name: {
      type: String,
      required: [true, "Drug name is required"],
      maxlength: [255, "Drug name cannot exceed 255 characters"],
      trim: true,
    },
    studies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Study' }],

    uniqueId: {
      type: String,
      maxlength: 100,
      default: null,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      maxlength: 500,
      default: null,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    remaining_quantity: {
      type: Number,
      min: [0, "Remaining quantity cannot be negative"],
      default: function() {
        // Auto-set remaining_quantity to quantity when creating new document
        return this.quantity !== undefined ? this.quantity : 0;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    date_created: {
      type: Date,
      default: () => new Date(),
    },
    last_updated: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better performance
drugsSchema.index({ slug: 1 })
drugsSchema.index({ uniqueId: 1 })
drugsSchema.index({ drug_name: 1 })
drugsSchema.index({ isActive: 1 })
drugsSchema.index({ quantity: 1 })
drugsSchema.index({ remaining_quantity: 1 })

// Pre-save hook for slug generation and remaining quantity logic
drugsSchema.pre("save", async function (next) {
  // Handle slug generation
  if (!this.uniqueId) {
    const { uniqueId, slug } = generateSlugWithUUID(this.drug_name)
    this.uniqueId = uniqueId
    this.slug = slug
  } else if (this.isModified("drug_name")) {
    this.slug = generateSlugWithUUID(this.drug_name, this.uniqueId).slug
  }

  // Auto-set remaining_quantity to quantity when creating new drug
  if (this.isNew && this.remaining_quantity === undefined) {
    this.remaining_quantity = this.quantity
  }

  // Ensure remaining_quantity doesn't exceed quantity
  if (this.remaining_quantity > this.quantity) {
    this.remaining_quantity = this.quantity
  }

  this.last_updated = new Date()
  next()
})

// Pre-validate hook to ensure remaining_quantity doesn't exceed quantity
drugsSchema.pre("validate", function (next) {
  if (this.remaining_quantity > this.quantity) {
    this.invalidate('remaining_quantity', 'Remaining quantity cannot exceed total quantity')
  }
  next()
})

// Virtual for absolute URL
drugsSchema.virtual("absoluteUrl").get(function () {
  return `/drugs/${this.slug}`
})

// Virtual for study count
drugsSchema.virtual("studyCount").get(function () {
  return this.studies ? this.studies.length : 0
})

// Virtual for used quantity
drugsSchema.virtual("usedQuantity").get(function () {
  return this.quantity - this.remaining_quantity
})

// Virtual for usage percentage
drugsSchema.virtual("usagePercentage").get(function () {
  if (this.quantity === 0) return 0
  return ((this.quantity - this.remaining_quantity) / this.quantity) * 100
})

drugsSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive
  return this.save()
}

drugsSchema.methods.updateQuantity = function (newQuantity) {
  this.quantity = newQuantity
  // Ensure remaining quantity doesn't exceed total quantity
  if (this.remaining_quantity > newQuantity) {
    this.remaining_quantity = newQuantity
  }
  return this.save()
}

drugsSchema.methods.updateRemainingQuantity = function (newRemainingQuantity) {
  // Ensure remaining quantity doesn't exceed total quantity
  if (newRemainingQuantity <= this.quantity && newRemainingQuantity >= 0) {
    this.remaining_quantity = newRemainingQuantity
  }
  return this.save()
}

// Method to consume/use drug quantity
drugsSchema.methods.consumeQuantity = function (consumeAmount) {
  if (consumeAmount > this.remaining_quantity) {
    throw new Error("Cannot consume more than remaining quantity")
  }
  this.remaining_quantity -= consumeAmount
  return this.save()
}

// Method to restock drug
drugsSchema.methods.restock = function (additionalQuantity) {
  this.quantity += additionalQuantity
  this.remaining_quantity += additionalQuantity
  return this.save()
}

drugsSchema.statics.findWithStudies = function (filter = {}) {
  return this.find(filter).populate("studies")
}

// Static method to get statistics
drugsSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalDrugs: { $sum: 1 },
        activeDrugs: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        totalStudies: {
          $sum: { $size: "$studies" },
        },
        totalQuantity: { $sum: "$quantity" },
        totalRemainingQuantity: { $sum: "$remaining_quantity" },
        totalUsedQuantity: { 
          $sum: { $subtract: ["$quantity", "$remaining_quantity"] } 
        },
      },
    },
  ])

  return (
    stats[0] || {
      totalDrugs: 0,
      activeDrugs: 0,
      totalStudies: 0,
      totalQuantity: 0,
      totalRemainingQuantity: 0,
      totalUsedQuantity: 0,
    }
  )
}

// Static method to find low stock drugs
drugsSchema.statics.findLowStock = function (threshold = 10) {
  return this.find({
    remaining_quantity: { $lte: threshold },
    isActive: true,
  })
}

// Static method to find out of stock drugs
drugsSchema.statics.findOutOfStock = function () {
  return this.find({
    remaining_quantity: 0,
    isActive: true,
  })
}

module.exports = mongoose.model("Drugs", drugsSchema)