// License calculations - ported from React's licenseCalculations.ts and measurePointLicenses.ts

// ============================================================
// Measure Point License Configs (from config/measurePointLicenses.ts)
// ============================================================

/**
 * @typedef {Object} MeasurePointTier
 * @property {string} name
 * @property {string} skuSuffix
 * @property {number} minPoints
 * @property {number} maxPoints
 * @property {number} pointsPerLicense
 */

/**
 * @typedef {Object} MeasurePointLicenseConfig
 * @property {string} prefix
 * @property {string} displayName
 * @property {string} tag
 * @property {MeasurePointTier[]} tiers
 */

/**
 * @typedef {Object} LicenseDistribution
 * @property {string} tierName
 * @property {string} skuSuffix
 * @property {number} quantity
 * @property {number} pointsCovered
 * @property {string} [licenseId]
 */

/** @type {MeasurePointLicenseConfig[]} */
export const MEASURE_POINT_LICENSE_CONFIGS = [
  {
    prefix: 'LIC-CMP-MONI-CHECK-',
    displayName: 'Monitoring Check',
    tag: 'licence',
    tiers: [
      { name: 'L1', skuSuffix: 'L1', minPoints: 0, maxPoints: 200, pointsPerLicense: 200 },
      { name: 'L2', skuSuffix: 'L2', minPoints: 201, maxPoints: 500, pointsPerLicense: 300 },
      { name: 'L3', skuSuffix: 'L3', minPoints: 501, maxPoints: 1000, pointsPerLicense: 500 },
      { name: 'L4', skuSuffix: 'L4', minPoints: 1001, maxPoints: 2500, pointsPerLicense: 1500 },
      { name: 'L5', skuSuffix: 'L5', minPoints: 2501, maxPoints: 5000, pointsPerLicense: 2500 },
      { name: 'L6', skuSuffix: 'L6', minPoints: 5001, maxPoints: 10000, pointsPerLicense: 5000 },
      { name: 'L7', skuSuffix: 'L7', minPoints: 10001, maxPoints: 20000, pointsPerLicense: 10000 },
      { name: 'L8', skuSuffix: 'L8', minPoints: 20001, maxPoints: 50000, pointsPerLicense: 30000 },
    ]
  },
  // === PLACEHOLDER: Add more license types here ===
];

// Tag colors for measure point license types
/** @type {Record<string, string>} */
export const TAG_COLORS = {
  'check': '#8b5cf6',
  // === PLACEHOLDER: Add tag colors for new license types ===
  // 'sensor': '#ec4899',
  // 'endpoint': '#06b6d4',
};


// ============================================================
// License Calculation Functions (from utils/licenseCalculations.ts)
// ============================================================

/**
 * Calculate license distribution for a given number of measure points.
 * Strategy: Fill tiers sequentially - L1 first (up to 200), then L2 for overflow (up to 300 more), etc.
 *
 * @param {number} totalPoints - Total number of measure points
 * @param {MeasurePointTier[]} tiers - Array of tier configurations
 * @returns {LicenseDistribution[]} Distribution of licenses across tiers
 */
export const calculateLicenseDistribution = (totalPoints, tiers) => {
  const distribution = [];
  let remainingPoints = totalPoints;

  // Sort tiers by minPoints ascending (process in order L1 -> L2 -> L3 etc.)
  const sortedTiers = [...tiers].sort((a, b) => a.minPoints - b.minPoints);

  for (const tier of sortedTiers) {
    if (remainingPoints <= 0) break;

    const tierCapacity = tier.pointsPerLicense;
    const pointsForThisTier = Math.min(remainingPoints, tierCapacity);

    if (pointsForThisTier > 0) {
      distribution.push({
        tierName: tier.name,
        skuSuffix: tier.skuSuffix,
        quantity: pointsForThisTier,
        pointsCovered: pointsForThisTier,
      });
      remainingPoints -= pointsForThisTier;
    }
  }

  // If we still have remaining points after all tiers, add more to the largest tier
  if (remainingPoints > 0 && sortedTiers.length > 0) {
    const largestTier = sortedTiers[sortedTiers.length - 1];
    const existingEntry = distribution.find(d => d.skuSuffix === largestTier.skuSuffix);

    if (existingEntry) {
      existingEntry.quantity += remainingPoints;
      existingEntry.pointsCovered += remainingPoints;
    } else {
      distribution.push({
        tierName: largestTier.name,
        skuSuffix: largestTier.skuSuffix,
        quantity: remainingPoints,
        pointsCovered: remainingPoints,
      });
    }
  }

  return distribution;
};

/**
 * Helper to check if a license matches any measure point config.
 * Returns the tag name and color if matched, or null otherwise.
 *
 * @param {string} sku - The SKU string to check
 * @returns {{ tag: string, color: string } | null}
 */
export const getMeasurePointTag = (sku) => {
  for (const config of MEASURE_POINT_LICENSE_CONFIGS) {
    if (sku.toUpperCase().includes(config.prefix.toUpperCase().replace(/-$/, ''))) {
      return {
        tag: config.tag,
        color: TAG_COLORS[config.tag] || '#6366f1',
      };
    }
  }
  return null;
};

/**
 * Calculate measure point licenses based on total points, license type prefix,
 * and available licenses.
 *
 * @param {number} totalMeasurePoints - Total measure points to distribute
 * @param {string} licenseTypePrefix - The license prefix to match (e.g. 'LIC-CMP-MONI-CHECK-')
 * @param {Array<{ id: string, sku: string }>} licenses - Available license objects
 * @returns {LicenseDistribution[]} Distribution with licenseId populated from matching licenses
 */
export function calculateMeasurePointLicenses(totalMeasurePoints, licenseTypePrefix, licenses) {
  const licConfig = MEASURE_POINT_LICENSE_CONFIGS.find(c => c.prefix === licenseTypePrefix);
  if (!licConfig || totalMeasurePoints <= 0) return [];

  const distribution = calculateLicenseDistribution(totalMeasurePoints, licConfig.tiers);

  // Map distribution to include license IDs from the actual licenses
  return distribution
    .map(dist => {
      // Find the matching license by SKU pattern
      const license = licenses.find(l =>
        l.sku.toLowerCase().includes(licenseTypePrefix.toLowerCase()) &&
        l.sku.toLowerCase().includes(dist.tierName.toLowerCase().replace(/\s+/g, ''))
      );

      return {
        ...dist,
        licenseId: license?.id || '',
      };
    })
    .filter(dist => dist.licenseId); // Only return distributions with valid license IDs
}
