/**
 * Curated dictionaries for realistic mock data generation.
 * Used by data-generator heuristics to produce natural-looking values.
 */

export const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Edward",
  "Fiona",
  "George",
  "Hannah",
  "Ivan",
  "Julia",
  "Kevin",
  "Laura",
  "Michael",
  "Nina",
  "Oscar",
  "Patricia",
  "Quinn",
  "Rachel",
  "Samuel",
  "Teresa",
  "Victor",
  "Wendy",
  "Xavier",
  "Yara",
  "Zachary",
];

export const LAST_NAMES = [
  "Anderson",
  "Brown",
  "Clark",
  "Davis",
  "Evans",
  "Fisher",
  "Garcia",
  "Harris",
  "Ibrahim",
  "Johnson",
  "Kim",
  "Lee",
  "Martinez",
  "Nguyen",
  "O'Brien",
  "Patel",
  "Quinn",
  "Robinson",
  "Smith",
  "Taylor",
  "Ueda",
  "Volkov",
  "Williams",
  "Xu",
  "Yamamoto",
];

export const PERSON_NAMES = FIRST_NAMES.map((f, i) => `${f} ${LAST_NAMES[i]}`);

export const TITLES = [
  "Wireless Bluetooth Headphones",
  "Smart Fitness Watch Pro",
  "Ergonomic Laptop Stand",
  "USB-C Multiport Hub",
  "Mechanical Gaming Keyboard",
  "Ultra-Light Running Shoes",
  "Canvas Travel Backpack",
  "Insulated Water Bottle 32oz",
  "Adjustable LED Desk Lamp",
  "Premium Leather Notebook",
  "Shockproof Phone Case",
  "Polarized Sport Sunglasses",
  "Drip Coffee Maker 12-Cup",
  "Non-Slip Yoga Mat 6mm",
  "Portable Bluetooth Speaker",
  "HD Webcam with Microphone",
  "Extended Mouse Pad XL",
  "Organic Cotton T-Shirt",
  "Fast Charge Power Bank 20K",
  "Bamboo Book Stand Adjustable",
  "Noise-Cancelling Earbuds",
  "Stainless Steel Thermos",
  "Compact Wireless Charger",
  "Waterproof Hiking Boots",
  "Digital Kitchen Scale",
];

export const DESCRIPTIONS = [
  "A premium product designed for everyday use with exceptional durability and comfort.",
  "Crafted with high-quality materials to deliver outstanding performance and reliability.",
  "The perfect balance of style and functionality for modern professionals.",
  "Engineered with precision to exceed expectations in every detail.",
  "An innovative solution that simplifies your daily routine effortlessly.",
  "Built to last with a sleek, minimalist design that fits any environment.",
  "Combines cutting-edge technology with intuitive user experience.",
  "A versatile choice trusted by thousands of satisfied customers worldwide.",
  "Thoughtfully designed to enhance productivity and reduce fatigue.",
  "Superior craftsmanship meets affordable pricing — best value in its class.",
  "Compact, lightweight, and powerful — ideal for on-the-go lifestyles.",
  "Features an ergonomic design that promotes comfort during extended use.",
  "Eco-friendly materials with zero compromise on quality or performance.",
  "Seamlessly integrates into your existing workflow with plug-and-play simplicity.",
  "Award-winning design recognized for both aesthetics and functionality.",
];

export const REVIEWS = [
  "Absolutely love this product! Exceeded all my expectations.",
  "Great value for the price. Would definitely recommend to friends.",
  "Solid build quality. Works exactly as described.",
  "Been using it daily for a month — still performs like new.",
  "Fast shipping and excellent packaging. Very impressed.",
  "Good product overall, but the instructions could be clearer.",
  "Perfect gift idea! The recipient was thrilled.",
  "Compared to competitors, this offers the best features at this price point.",
  "Sleek design that looks even better in person than in photos.",
  "Minor issue with setup, but customer support resolved it quickly.",
  "This is my third purchase from this brand — consistently excellent.",
  "Lightweight yet sturdy. Takes up minimal desk space.",
  "The attention to detail is remarkable. You can feel the quality.",
  "Does exactly what it promises. No gimmicks, just solid performance.",
  "Upgraded from a cheaper alternative — the difference is night and day.",
];

export const PARAGRAPHS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nunc viverra imperdiet enim.",
  "Proin quam nisl, tincidunt et, mattis eget, convallis nec, purus. Cum sociis natoque penatibus.",
  "Maecenas sed diam eget risus varius blandit sit amet non magna. Integer posuere erat a ante.",
];

export const BRANDS = [
  "TechNova",
  "AuraLux",
  "PeakLine",
  "VeloCore",
  "EchoStream",
  "NexWave",
  "PrimeVault",
  "ZenithCo",
  "BlueRidge",
  "SkyForge",
];

export const TAGS = [
  "featured",
  "new-arrival",
  "best-seller",
  "on-sale",
  "limited-edition",
  "eco-friendly",
  "premium",
  "trending",
  "exclusive",
  "clearance",
];

export const CATEGORIES = [
  "Electronics",
  "Clothing",
  "Books",
  "Home & Garden",
  "Sports",
  "Toys & Games",
  "Health & Beauty",
  "Automotive",
  "Food & Drink",
  "Office",
];

export const STATUSES = ["active", "inactive", "pending", "archived", "draft"];
export const PRIORITIES = ["low", "medium", "high", "critical", "urgent"];
export const ROLES = ["admin", "user", "editor", "viewer", "moderator"];

export const STREETS = [
  "Main St",
  "Oak Avenue",
  "Elm Drive",
  "Maple Road",
  "Cedar Lane",
  "Pine Street",
  "Birch Court",
  "Walnut Blvd",
  "Cherry Way",
  "Willow Place",
];

export const CITIES = [
  "New York",
  "London",
  "Tokyo",
  "Paris",
  "Berlin",
  "Sydney",
  "Toronto",
  "Amsterdam",
  "Singapore",
  "San Francisco",
  "Barcelona",
  "Seoul",
  "Dubai",
  "Stockholm",
  "Melbourne",
];

export const STATES = ["CA", "NY", "TX", "FL", "IL", "PA", "OH", "GA", "NC", "MI"];

export const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Japan",
  "France",
  "Germany",
  "Australia",
  "Canada",
  "Netherlands",
  "Singapore",
  "South Korea",
];

export const COLOR_NAMES = [
  "red",
  "blue",
  "green",
  "amber",
  "violet",
  "rose",
  "cyan",
  "emerald",
  "indigo",
  "orange",
];

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"];
export const LOCALES = ["en", "es", "fr", "de", "ja", "zh", "ko", "pt", "it", "nl"];
