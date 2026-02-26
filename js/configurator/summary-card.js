// Summary Card component
// Ported from React SummaryCard.tsx - displays HK, VK, and Monthly totals

import { currency } from '../utils/format.js';

/**
 * Create the summary card showing HK Total, VK Total, and Monthly Total.
 *
 * @param {Object} props
 * @param {number} props.hk      - HK total (Herstellkosten)
 * @param {number} props.vk      - VK total (Verkaufspreis)
 * @param {number} props.monthly  - Monthly total
 * @returns {{ element: HTMLElement, update: Function }}
 */
export function createSummaryCard({ hk = 0, vk = 0, monthly = 0 }) {
  const el = document.createElement('div');
  el.className = 'card p-6 bg-white self-end w-full max-w-sm';

  let currentHk = hk;
  let currentVk = vk;
  let currentMonthly = monthly;

  function render() {
    el.innerHTML = '';

    // Title
    const heading = document.createElement('h3');
    heading.className = 'mb-4 border-b pb-2';
    heading.textContent = 'Summary';
    el.appendChild(heading);

    // HK Row
    const hkRow = document.createElement('div');
    hkRow.className = 'flex justify-between mb-2 text-sm';
    const hkLabel = document.createElement('span');
    hkLabel.className = 'text-secondary';
    hkLabel.textContent = 'HK Total:';
    const hkValue = document.createElement('span');
    hkValue.className = 'font-medium';
    hkValue.textContent = currency(currentHk);
    hkRow.appendChild(hkLabel);
    hkRow.appendChild(hkValue);
    el.appendChild(hkRow);

    // VK Row
    const vkRow = document.createElement('div');
    vkRow.className = 'flex justify-between mb-2 text-sm';
    const vkLabel = document.createElement('span');
    vkLabel.className = 'text-secondary';
    vkLabel.textContent = 'VK Total:';
    const vkValue = document.createElement('span');
    vkValue.className = 'font-bold';
    vkValue.textContent = currency(currentVk);
    vkRow.appendChild(vkLabel);
    vkRow.appendChild(vkValue);
    el.appendChild(vkRow);

    // Dashed border separator + Monthly Row
    const monthlyRow = document.createElement('div');
    monthlyRow.className = 'flex justify-between items-center pt-2 mt-2 border-t border-dashed';
    const monthlyLabel = document.createElement('span');
    monthlyLabel.textContent = 'Total Monthly:';
    const monthlyValue = document.createElement('span');
    monthlyValue.className = 'text-2xl';
    monthlyValue.style.color = 'var(--primary)';
    monthlyValue.textContent = currency(currentMonthly);
    monthlyRow.appendChild(monthlyLabel);
    monthlyRow.appendChild(monthlyValue);
    el.appendChild(monthlyRow);
  }

  render();

  /**
   * Update the summary card values and re-render.
   * @param {{ hk?: number, vk?: number, monthly?: number }} props
   */
  function update(props) {
    if (props.hk !== undefined) currentHk = props.hk;
    if (props.vk !== undefined) currentVk = props.vk;
    if (props.monthly !== undefined) currentMonthly = props.monthly;
    render();
  }

  return { element: el, update };
}
