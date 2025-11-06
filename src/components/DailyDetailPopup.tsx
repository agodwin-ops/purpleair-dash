import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface DailyData {
  date: string;
  average: number;
  hours: { hour: number; pm25: number; aqi: number }[];
}

interface DailyDetailPopupProps {
  dayData: DailyData;
  onClose: () => void;
}

const DailyDetailPopup: React.FC<DailyDetailPopupProps> = ({ dayData, onClose }) => {
  const getColorForAQI = (aqi: number): string => {
    if (aqi <= 50) return '#00e400'; // Good - Green
    if (aqi <= 100) return '#ffff00'; // Moderate - Yellow
    if (aqi <= 150) return '#ff7e00'; // Unhealthy for Sensitive - Orange
    if (aqi <= 200) return '#ff0000'; // Unhealthy - Red
    if (aqi <= 300) return '#8f3f97'; // Very Unhealthy - Purple
    return '#7e0023'; // Hazardous - Maroon
  };

  const chartData = {
    labels: dayData.hours.map(h => `${h.hour}:00`),
    datasets: [
      {
        label: 'AQI',
        data: dayData.hours.map(h => h.aqi),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: dayData.hours.map(h => getColorForAQI(h.aqi)),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: `Hourly AQI Levels - ${new Date(dayData.date).toLocaleDateString('en-US', { 
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}`,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const aqi = context.parsed.y;
            let category = 'Good';
            if (aqi > 50) category = 'Moderate';
            if (aqi > 100) category = 'Unhealthy for Sensitive';
            if (aqi > 150) category = 'Unhealthy';
            if (aqi > 200) category = 'Very Unhealthy';
            if (aqi > 300) category = 'Hazardous';
            
            return [
              `AQI: ${aqi}`,
              `Category: ${category}`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'AQI',
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Hour of Day',
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
  };

  const maxAQI = Math.max(...dayData.hours.map(h => h.aqi));
  const minAQI = Math.min(...dayData.hours.map(h => h.aqi));
  const hoursAboveWHO = dayData.hours.filter(h => h.pm25 > 15).length;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6b7280',
            padding: '4px',
            borderRadius: '4px',
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          ×
        </button>

        {/* Chart */}
        <div style={{ height: '400px', marginBottom: '24px' }}>
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Summary Statistics */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: getColorForAQI(Math.round(dayData.average)) }}>
              {Math.round(dayData.average)}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Daily Avg AQI</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: getColorForAQI(maxAQI) }}>
              {maxAQI}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Peak AQI</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: getColorForAQI(minAQI) }}>
              {minAQI}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Lowest AQI</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ 
              fontSize: '20px', 
              fontWeight: 'bold', 
              color: hoursAboveWHO > 12 ? '#ef4444' : hoursAboveWHO > 6 ? '#f97316' : '#22c55e'
            }}>
              {hoursAboveWHO}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Hours &gt; WHO</div>
          </div>
        </div>

        {/* WHO Reference */}
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#dbeafe', 
          borderRadius: '8px',
          fontSize: '14px',
          color: '#1e40af'
        }}>
          <strong>WHO Air Quality Guideline:</strong> 15 μg/m³ daily average for PM2.5
        </div>
      </div>
    </div>
  );
};

export default DailyDetailPopup;