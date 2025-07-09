const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

// Import routes
const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const dashboardRoutes = require("./routes/dashboard")

// Import middleware
const errorHandler = require("./middleware/errorHandler")
const { createDefaultAdmin } = require("./utils/createAdmin")
const studyPhaseRoutes = require("./routes/studyPhases")
const studytypeRoutes = require("./routes/StudyType")
const studyRoutes = require("./routes/studies")
const studyDesignRoutes = require("./routes/StudyDesigns")
const blindingStatusRoutes = require("./routes/BlindingStatus")
const siteRoutes = require("./routes/siteRoutes")
const sponsorsRoutes = require("./routes/Sponsors")
const drugsRoutes = require("./routes/Drugs")
const drugGroupsRoutes = require("./routes/DrugGroup")
const excelRoutes = require('./routes/excelRoutes');
const shipmentRoutes = require("./routes/shipments")
// const drugShipmentRoutes = require('./routes/drugShipmentRoutes');
// const drugShipmentRoutes = require('./routes/DrugShipment');
// const shipmentAcknowledgmentRoutes = require('./routes/ShipmentAcknowledgment');


const app = express()

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://yourdomain.com"]
        : ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
})
app.use("/api/", limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Database connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB")
    // Create default admin user
    createDefaultAdmin()
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  })

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/studies", studyRoutes)
app.use("/api/study-phases", studyPhaseRoutes)
app.use("/api/study-types", studytypeRoutes)
app.use("/api/study-designs", studyDesignRoutes)
app.use("/api/blinding-status", blindingStatusRoutes)
app.use("/api/sites", siteRoutes)
app.use("/api/sponsors", sponsorsRoutes)
app.use("/api/drugs", drugsRoutes)
app.use("/api/drug-groups", drugGroupsRoutes)
app.use('/api/excel', excelRoutes);
app.use("/api/shipments", shipmentRoutes)
// app.use('/api/drug-shipments', drugShipmentRoutes);

// app.use("/api/drug-shipments", drugShipmentRoutes);
// app.use("/api/shipment-acknowledgments", shipmentAcknowledgmentRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Error handling middleware
app.use(errorHandler)

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV}`)
})

module.exports = app
