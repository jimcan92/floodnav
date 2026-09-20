import { VehicleCategory } from "../types/navigation";

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  {
    id: "low_clearance",
    title: "Low Ground Clearance",
    subtitle: "Sedans, Hatchbacks, Low Coupes",
    groundClearanceRange: "130 mm – 160 mm (~5–6 inches)",
    groundClearanceMm: 145,
    maxSafeWaterDepthCm: 15, // Up to 15 cm (~6 in, wheel rim/ankle level)
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    description:
      "Example category for comparing simulated flood exposure; not a real-world safety assessment.",
    warningNotice:
      "Simulation assumption only. This threshold is not a verified vehicle wading rating.",
    sampleModels: [
      "Toyota Vios",
      "Honda Civic",
      "Hyundai Accent",
      "Mazda 3",
      "Mitsubishi Mirage G4",
    ],
    sampleImages: [
      {
        title: "Compact Sedan",
        model: "Toyota Vios / Honda City",
        imageUrl:
          "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80",
        clearance: "133–140 mm",
      },
      {
        title: "Hatchback",
        model: "Honda Civic / Brio",
        imageUrl:
          "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=600&q=80",
        clearance: "135–150 mm",
      },
      {
        title: "Mid-size Sedan",
        model: "Hyundai Accent / Elantra",
        imageUrl:
          "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80",
        clearance: "140–155 mm",
      },
    ],
  },
  {
    id: "medium_clearance",
    title: "Medium Ground Clearance",
    subtitle: "Crossovers, Compact SUVs, MPVs",
    groundClearanceRange: "175 mm – 220 mm (~7–8.5 inches)",
    groundClearanceMm: 195,
    maxSafeWaterDepthCm: 25, // Up to 25 cm (~10 in, lower bumper / half wheel level)
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    description:
      "Example category for comparing simulated flood exposure; not a real-world safety assessment.",
    warningNotice:
      "Simulation assumption only. This threshold is not a verified vehicle wading rating.",
    sampleModels: [
      "Toyota Rush",
      "Mitsubishi Xpander",
      "Honda HR-V",
      "Toyota Veloz",
      "Subaru Forester",
    ],
    sampleImages: [
      {
        title: "Compact SUV",
        model: "Honda HR-V / CR-V",
        imageUrl:
          "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80",
        clearance: "185–200 mm",
      },
      {
        title: "Family MPV / Crossover",
        model: "Toyota Rush / Xpander Cross",
        imageUrl:
          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80",
        clearance: "205–220 mm",
      },
      {
        title: "Subcompact Crossover",
        model: "Toyota Raize / Kia Seltos",
        imageUrl:
          "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80",
        clearance: "190–205 mm",
      },
    ],
  },
  {
    id: "high_clearance",
    title: "High Ground Clearance",
    subtitle: "4x4 Pickups, Full-size SUVs, Trucks",
    groundClearanceRange: "225 mm – 310 mm (~9–12+ inches)",
    groundClearanceMm: 260,
    maxSafeWaterDepthCm: 50, // Up to 50 cm (~20 in, knee to upper tire level)
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    description:
      "Example category for comparing simulated flood exposure; not a real-world safety assessment.",
    warningNotice:
      "Simulation assumption only. This threshold is not a verified vehicle wading rating.",
    sampleModels: [
      "Toyota Hilux",
      "Ford Ranger",
      "Toyota Fortuner",
      "Isuzu D-Max",
      "Mitsubishi Montero Sport",
    ],
    sampleImages: [
      {
        title: "4x4 Pickup Truck",
        model: "Ford Ranger / Toyota Hilux",
        imageUrl:
          "https://images.unsplash.com/photo-1559416523-140ddc3d238c?auto=format&fit=crop&w=600&q=80",
        clearance: "235–280 mm",
      },
      {
        title: "Full-size PPV / SUV",
        model: "Toyota Fortuner / Montero",
        imageUrl:
          "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=600&q=80",
        clearance: "225–279 mm",
      },
      {
        title: "Heavy Duty 4WD",
        model: "Isuzu D-Max / Land Cruiser",
        imageUrl:
          "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=600&q=80",
        clearance: "240–310 mm",
      },
    ],
  },
  {
    id: "motorcycle",
    title: "Motorcycle / Scooter",
    subtitle: "Scooters, Underbones, Commuter Bikes",
    groundClearanceRange: "130 mm – 165 mm (~5–6.5 inches)",
    groundClearanceMm: 140,
    maxSafeWaterDepthCm: 15, // Up to 15 cm max
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    description:
      "Example category for comparing simulated flood exposure; not a real-world safety assessment.",
    warningNotice:
      "Simulation assumption only. This threshold is not a verified vehicle wading rating.",
    sampleModels: [
      "Yamaha NMAX",
      "Honda Click 125i",
      "Yamaha Aerox",
      "Honda ADV 160",
      "Vespa Primavera",
    ],
    sampleImages: [
      {
        title: "Maxi Scooter",
        model: "Yamaha NMAX / Honda PCX",
        imageUrl:
          "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80",
        clearance: "135 mm",
      },
      {
        title: "Underbone / Commuter",
        model: "Honda Click / Wave / Beat",
        imageUrl:
          "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=600&q=80",
        clearance: "132–140 mm",
      },
      {
        title: "Adventure Scooter",
        model: "Honda ADV 160",
        imageUrl:
          "https://images.unsplash.com/photo-1609630875171-b1321377ee65?auto=format&fit=crop&w=600&q=80",
        clearance: "165 mm",
      },
    ],
  },
  {
    id: "bicycle",
    title: "Bicycle / E-Bike / E-Scooter",
    subtitle: "Pedal Bicycles, E-Bikes, Kick Scooters",
    groundClearanceRange: "100 mm – 140 mm",
    groundClearanceMm: 110,
    maxSafeWaterDepthCm: 10, // Up to 10 cm max
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    description:
      "Example category for comparing simulated flood exposure; not a real-world safety assessment.",
    warningNotice:
      "Simulation assumption only. This threshold is not a verified vehicle wading rating.",
    sampleModels: [
      "Mountain Bike (MTB)",
      "Road / Commuter Bike",
      "E-Kick Scooter",
      "E-Trike / E-Bike",
    ],
    sampleImages: [
      {
        title: "Commuter / City Bike",
        model: "Standard Hybrid / Road Bike",
        imageUrl:
          "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80",
        clearance: "110 mm",
      },
      {
        title: "Mountain Bike",
        model: "Hardtail / Trail MTB",
        imageUrl:
          "https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?auto=format&fit=crop&w=600&q=80",
        clearance: "140 mm",
      },
      {
        title: "Electric Kick Scooter",
        model: "Foldable E-Scooter",
        imageUrl:
          "https://images.unsplash.com/photo-1596707415174-8b0932c02119?auto=format&fit=crop&w=600&q=80",
        clearance: "90–110 mm",
      },
    ],
  },
];

export const DEFAULT_VEHICLE_CATEGORY = VEHICLE_CATEGORIES[0]; // Low clearance Sedan by default
