import React, { useRef, useEffect, useState, useCallback } from 'react';

interface DailyData {
  date: string;
  average: number;
  hours: { hour: number; pm25: number; aqi: number }[];
}

interface SegmentedHalfCircleProps {
  dailyData: DailyData[];
  sleepData?: DailyData[];
  exerciseData?: DailyData[];
  onSegmentClick: (dayData: DailyData) => void;
}

const SegmentedHalfCircle: React.FC<SegmentedHalfCircleProps> = ({ dailyData, sleepData, exerciseData, onSegmentClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const getColorForAQI = (aqi: number): string => {
    if (aqi <= 50) return '#00e400'; // Good - Green
    if (aqi <= 100) return '#ffff00'; // Moderate - Yellow
    if (aqi <= 150) return '#ff7e00'; // Unhealthy for Sensitive - Orange
    if (aqi <= 200) return '#ff0000'; // Unhealthy - Red
    if (aqi <= 300) return '#8f3f97'; // Very Unhealthy - Purple
    return '#7e0023'; // Hazardous - Maroon
  };


  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dailyData.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const centerX = rect.width / 2;
    const centerY = rect.height - 20;
    const radius = Math.min(rect.width, rect.height) / 2 - 40;
    const innerRadius = radius * 0.6;

    ctx.clearRect(0, 0, rect.width, rect.height);

    const totalDays = dailyData.length;
    const anglePerDay = Math.PI / totalDays;

    // Draw base outdoor exposure segments (24-hour)
    dailyData.forEach((day, index) => {
      const startAngle = Math.PI + (index * anglePerDay);
      const endAngle = Math.PI + ((index + 1) * anglePerDay);
      
      const aqi = day.average; // Average is now already in AQI format
      const color = getColorForAQI(aqi);
      
      // Highlight hovered segment
      if (hoveredSegment === index) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }

      // Draw segment
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Draw segment border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });

    // Draw sleep conditions overlay if provided
    if (sleepData && sleepData.length > 0) {
      const sleepOuterRadius = radius + 25;
      const sleepInnerRadius = radius + 5;
      
      sleepData.forEach((day, index) => {
        const startAngle = Math.PI + (index * anglePerDay);
        const endAngle = Math.PI + ((index + 1) * anglePerDay);
        
        const aqi = day.average; // Average is now already in AQI format
        const color = getColorForAQI(aqi);
        
        // Draw sleep overlay segment
        ctx.beginPath();
        ctx.arc(centerX, centerY, sleepOuterRadius, startAngle, endAngle);
        ctx.arc(centerX, centerY, sleepInnerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7; // Semi-transparent overlay
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset transparency

        // Draw segment border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Draw exercise conditions overlay if provided (outermost layer)
    if (exerciseData && exerciseData.length > 0) {
      const exerciseOuterRadius = radius + 50;
      const exerciseInnerRadius = radius + 30;
      
      exerciseData.forEach((day, index) => {
        const startAngle = Math.PI + (index * anglePerDay);
        const endAngle = Math.PI + ((index + 1) * anglePerDay);
        
        const aqi = day.average; // Average is now already in AQI format
        const color = getColorForAQI(aqi);
        
        // Draw exercise overlay segment
        ctx.beginPath();
        ctx.arc(centerX, centerY, exerciseOuterRadius, startAngle, endAngle);
        ctx.arc(centerX, centerY, exerciseInnerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6; // Semi-transparent overlay
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset transparency

        // Draw segment border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Draw center circle with overall average
    const overallAverage = dailyData.reduce((sum, day) => sum + day.average, 0) / dailyData.length;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius * 0.8, 0, 2 * Math.PI);
    ctx.fillStyle = '#f9fafb';
    ctx.fill();
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center text - overallAverage is already AQI
    const overallAQI = Math.round(overallAverage);
    ctx.fillStyle = getColorForAQI(overallAQI);
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${overallAQI}`, centerX, centerY - 8);
    
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.fillText('AQI', centerX, centerY + 8);
  }, [dailyData, sleepData, exerciseData, hoveredSegment]);

  const getSegmentAtPosition = (x: number, y: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || !dailyData.length) return null;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height - 20;
    const radius = Math.min(rect.width, rect.height) / 2 - 40;
    const innerRadius = radius * 0.6;

    const relativeX = x - rect.left - centerX;
    const relativeY = y - rect.top - centerY;
    
    const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
    
    if (distance < innerRadius || distance > radius) return null;
    
    let angle = Math.atan2(relativeY, relativeX);
    if (angle < 0) angle += 2 * Math.PI;
    
    // Only consider the bottom half (π to 2π)
    if (angle < Math.PI) return null;
    
    const normalizedAngle = angle - Math.PI;
    const totalDays = dailyData.length;
    const anglePerDay = Math.PI / totalDays;
    
    const segmentIndex = Math.floor(normalizedAngle / anglePerDay);
    return segmentIndex >= 0 && segmentIndex < totalDays ? segmentIndex : null;
  };

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  const handleMouseMove = (event: React.MouseEvent) => {
    const segment = getSegmentAtPosition(event.clientX, event.clientY);
    setHoveredSegment(segment);
    setMousePos({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredSegment(null);
  };

  const handleClick = (event: React.MouseEvent) => {
    const segment = getSegmentAtPosition(event.clientX, event.clientY);
    if (segment !== null && dailyData[segment]) {
      onSegmentClick(dailyData[segment]);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '400px' }}>
      <canvas
        ref={canvasRef}
        style={{ 
          width: '100%', 
          height: '100%', 
          cursor: hoveredSegment !== null ? 'pointer' : 'default'
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      
      {hoveredSegment !== null && dailyData[hoveredSegment] && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 10,
            top: mousePos.y - 10,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap'
          }}
        >
          <div>{new Date(dailyData[hoveredSegment].date).toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric' 
          })}</div>
          <div>AQI: {Math.round(dailyData[hoveredSegment].average)}</div>
        </div>
      )}
    </div>
  );
};

export default SegmentedHalfCircle;