import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';

const width = 800; // px
const height = 400; // px

// Site theme colors
export const themeColors = {
  primary: '#2563eb', // blue
  secondary: '#3b82f6', // lighter blue
  accent: '#f59e42', // orange
  background: '#f8fafc',
  text: '#111827',
  success: '#10b981',
  warning: '#f59e42',
  error: '#ef4444',
  info: '#3b82f6',
  gray: '#6b7280',
};

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: themeColors.background });

export async function renderChart(config: ChartConfiguration): Promise<Buffer> {
  return chartJSNodeCanvas.renderToBuffer(config);
}

// Example chart configs
export function barChartConfig({
  labels,
  datasets,
  title,
  yLabel,
}: {
  labels: string[];
  datasets: { label: string; data: number[]; backgroundColor?: string }[];
  title: string;
  yLabel?: string;
}): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: ds.backgroundColor || themeColors.primary,
      })),
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: title,
          color: themeColors.primary,
          font: { size: 22, weight: 'bold' },
        },
        legend: { display: datasets.length > 1, labels: { color: themeColors.text } },
      },
      scales: {
        x: { ticks: { color: themeColors.text } },
        y: {
          title: yLabel ? { display: true, text: yLabel, color: themeColors.text } : undefined,
          ticks: { color: themeColors.text },
        },
      },
    },
  } as ChartConfiguration;
}

export function pieChartConfig({
  labels,
  data,
  title,
}: {
  labels: string[];
  data: number[];
  title: string;
}): ChartConfiguration {
  return {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [themeColors.primary, themeColors.accent, themeColors.success, themeColors.warning, themeColors.error, themeColors.gray],
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: title,
          color: themeColors.primary,
          font: { size: 22, weight: 'bold' },
        },
        legend: { labels: { color: themeColors.text } },
      },
    },
  } as ChartConfiguration;
} 