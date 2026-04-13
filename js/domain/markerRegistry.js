export const DISASTER_ZONES = {
  flood: {
    label: 'Flood 🌊',
    color: '#0088CC',
    defaultRadiusKm: 10,
    popupFields: ['waterLevelM', 'displaced', 'date', 'severity'],
  },
  earthquake: {
    label: 'Earthquake 🏚',
    color: '#8B4513',
    radiusFromMagnitudeKm: (m) => m * 5,
    popupFields: ['magnitude', 'deaths', 'damagePct', 'date'],
  },
  wildfire: {
    label: 'Wildfire 🔥',
    color: '#FF6600',
    defaultRadiusKm: 8,
    popupFields: ['areaBurnedHa', 'windDirection', 'spreadRate'],
  },
  cyclone: {
    label: 'Cyclone 🌀',
    color: '#6600CC',
    defaultRadiusKm: 25,
    popupFields: ['windSpeedKmh', 'category', 'landfallDate'],
  },
  landslide: {
    label: 'Landslide 🏔',
    color: '#8B0000',
    defaultRadiusKm: 5,
    popupFields: ['volumeM3', 'slopeAngle', 'roadBlockage'],
  },
};

export const HELP_CENTERS = {
  commandCenter: { label: 'Command Center ⌂', emoji: '⌂' },
  hospital: { label: 'Hospital 🏥', emoji: '🏥' },
  reliefCamp: { label: 'Relief Camp 🏕', emoji: '🏕' },
  helipad: { label: 'Helipad 🚁', emoji: '🚁' },
  evacPoint: { label: 'Evacuation Point 🏃', emoji: '🏃' },
};

export const RESOURCE_MARKERS = {
  chopperBase: { label: 'Chopper Base 🚁', emoji: '🚁' },
  foodDepot: { label: 'Food Depot 🍱', emoji: '🍱' },
  medicalStock: { label: 'Medical Stock 💊', emoji: '💊' },
  fuelStation: { label: 'Fuel Station ⛽', emoji: '⛽' },
};

export const ROAD_ACTIONS = {
  block: { label: 'Block Road ❌', emoji: '❌' },
  partial: { label: 'Partial Block ⚠', emoji: '⚠' },
  unblock: { label: 'Unblock ✅', emoji: '✅' },
};
