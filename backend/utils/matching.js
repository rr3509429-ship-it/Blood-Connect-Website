// backend/utils/matching.js
// Smart donor matching algorithm using scoring

/**
 * Haversine formula — calculates distance between two GPS coordinates in km
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Blood group compatibility map
 * Key = requested blood group, Value = compatible donor groups
 */
const COMPATIBILITY = {
  'A+':  ['A+', 'A-', 'O+', 'O-'],
  'A-':  ['A-', 'O-'],
  'B+':  ['B+', 'B-', 'O+', 'O-'],
  'B-':  ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+':  ['O+', 'O-'],
  'O-':  ['O-'],
};

/**
 * Calculate days since last donation
 * Donors should wait 56 days (8 weeks) between donations
 */
const daysSinceLastDonation = (lastDonationDate) => {
  if (!lastDonationDate) return 999; // Never donated = very available
  const now = new Date();
  const last = new Date(lastDonationDate);
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
};

/**
 * Score a single donor for a given request
 * Higher score = better match
 */
const scoreDonor = (donor, request) => {
  let score = 0;

  // 1. Availability (0 or 30 points)
  if (!donor.availability) {
    if (process.env.NODE_ENV === 'development') {
      // In dev, allow unavailable donors
    } else {
      return -1; // Skip unavailable donors
    }
  } else {
    score += 30;
  }

  // 2. Distance score (up to 25 points)
  if (
    donor.location &&
    donor.location.lat !== 0 &&
    request.location &&
    request.location.lat !== 0
  ) {
    const dist = haversineDistance(
      donor.location.lat, donor.location.lng,
      request.location.lat, request.location.lng
    );
    if (dist < 5)       score += 25;
    else if (dist < 15) score += 20;
    else if (dist < 30) score += 15;
    else if (dist < 60) score += 10;
    else                score += 5;
  } else {
    // No GPS — match by city name
    if (donor.city.toLowerCase() === request.city.toLowerCase()) score += 15;
  }

  // 3. Last donation (up to 25 points) — 56 days cooldown
  const days = daysSinceLastDonation(donor.last_donation_date);
  if (days >= 365)      score += 25; // Long time ago
  else if (days >= 180) score += 20;
  else if (days >= 90)  score += 15;
  else if (days >= 56)  score += 10; // Just past minimum
  else {
    if (process.env.NODE_ENV !== 'development') {
      return -1;   // Too soon, disqualify
    }
    // In dev, allow even if too soon
  }

  // 4. Response rate (up to 20 points)
  score += Math.floor((donor.response_rate / 100) * 20);

  // 5. Emergency boost (10 bonus points if emergency)
  if (request.isEmergency) score += 10;

  return score;
};

/**
 * Main matching function
 * Returns top 5 compatible donors sorted by score
 */
const matchDonors = (donors, request) => {
  const compatibleGroups = COMPATIBILITY[request.blood_group] || [request.blood_group];

  const scored = donors
    .filter((d) => compatibleGroups.includes(d.blood_group))
    .map((d) => ({ donor: d, score: scoreDonor(d, request) }))
    .filter((item) => process.env.NODE_ENV === 'development' ? item.score >= 0 : item.score > 0) // Remove disqualified
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // Top 5

  return scored.map((item) => ({
    ...item.donor.toObject ? item.donor.toObject() : item.donor,
    matchScore: item.score,
    distance: (item.donor.location && item.donor.location.lat !== 0 && request.location && request.location.lat !== 0)
      ? haversineDistance(item.donor.location.lat, item.donor.location.lng, request.location.lat, request.location.lng).toFixed(1)
      : null
  }));
};

module.exports = { matchDonors, haversineDistance, COMPATIBILITY };
