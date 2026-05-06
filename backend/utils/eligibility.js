// backend/utils/eligibility.js
const checkEligibility = (user) => {
  const reasons = [];
  if (!user.age || user.age < 18)  reasons.push('Must be at least 18 years old');
  if (user.age > 65)               reasons.push('Must be 65 years or younger');
  if (!user.weight || user.weight < 50) reasons.push('Must weigh at least 50 kg');
  if (user.last_donation_date) {
    const days = Math.floor((new Date() - new Date(user.last_donation_date)) / 86400000);
    if (days < 56) reasons.push(`Must wait ${56 - days} more days since last donation`);
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    nextEligibleDate: user.last_donation_date
      ? new Date(new Date(user.last_donation_date).getTime() + 56 * 86400000)
      : new Date()
  };
};
module.exports = { checkEligibility };
