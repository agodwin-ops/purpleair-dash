import React, { useState, useEffect, useMemo } from 'react';
import SegmentedHalfCircle from './SegmentedHalfCircle.tsx';
import DailyDetailPopup from './DailyDetailPopup.tsx';
import './PurpleAirDashboard.css';

interface DataPoint {
  timestamp: Date;
  humidity: number;
  temperature: number;
  pm25_cf_1: number;
}

interface SleepCondition {
  name: string;
  factor: number;
}

interface ExerciseCondition {
  name: string;
  ventilationRate: number; // L/min
}

interface DailyData {
  date: string;
  average: number;
  hours: { hour: number; pm25: number; aqi: number }[];
}

const sleepConditions: SleepCondition[] = [
  { name: 'No Sleep Protection', factor: 1.0 },
  { name: 'Indoor Sleeping', factor: 0.5 },
  { name: 'Tent Sleeping', factor: 0.95 },
  { name: 'HEPA Filtered Sleeping', factor: 0.25 }
];

const exerciseConditions: ExerciseCondition[] = [
  { name: 'At Rest', ventilationRate: 7.5 }, // Normal resting ventilation
  { name: 'Light Work', ventilationRate: 20 }, 
  { name: 'Moderate Exercise', ventilationRate: 35 },
  { name: 'Heavy Work', ventilationRate: 50 }
];

const PurpleAirDashboard: React.FC = () => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSleepCondition, setSelectedSleepCondition] = useState<number>(0);
  const [showSleepOverlay, setShowSleepOverlay] = useState<boolean>(false);
  const [selectedExerciseCondition, setSelectedExerciseCondition] = useState<number>(0);
  const [showExerciseOverlay, setShowExerciseOverlay] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DailyData | null>(null);

  // Load CSV data
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/Sudpurpleair.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');
        
        const parsedData: DataPoint[] = lines.slice(1).map(line => {
          const values = line.split(',');
          return {
            timestamp: new Date(values[0]),
            humidity: parseFloat(values[2]) || 0,
            temperature: parseFloat(values[3]) || 0,
            pm25_cf_1: parseFloat(values[9]) || 0
          };
        }).filter(point => !isNaN(point.pm25_cf_1));

        setData(parsedData);
        
        // Set default date range to first and last data points
        if (parsedData.length > 0) {
          setStartDate(parsedData[0].timestamp.toISOString().split('T')[0]);
          setEndDate(parsedData[parsedData.length - 1].timestamp.toISOString().split('T')[0]);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // EPA PM2.5 conversion formula
  const convertToPM25 = (rawPM25: number, humidity: number): number => {
    return 0.524 * rawPM25 - 0.0862 * humidity + 5.75;
  };

  // Convert PM2.5 to AQI using EPA formula
  const convertPM25ToAQI = (pm25: number): number => {
    const breakpoints = [
      { pm25Low: 0, pm25High: 12, aqiLow: 0, aqiHigh: 50 },
      { pm25Low: 12.1, pm25High: 35.4, aqiLow: 51, aqiHigh: 100 },
      { pm25Low: 35.5, pm25High: 55.4, aqiLow: 101, aqiHigh: 150 },
      { pm25Low: 55.5, pm25High: 150.4, aqiLow: 151, aqiHigh: 200 },
      { pm25Low: 150.5, pm25High: 250.4, aqiLow: 201, aqiHigh: 300 },
      { pm25Low: 250.5, pm25High: 500.4, aqiLow: 301, aqiHigh: 500 }
    ];

    for (const bp of breakpoints) {
      if (pm25 >= bp.pm25Low && pm25 <= bp.pm25High) {
        return Math.round(((bp.aqiHigh - bp.aqiLow) / (bp.pm25High - bp.pm25Low)) * (pm25 - bp.pm25Low) + bp.aqiLow);
      }
    }
    
    // If PM2.5 is above highest breakpoint
    if (pm25 > 500.4) return 500;
    return 0;
  };

  // Filter data by date range and calculate metrics
  const filteredData = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include full end date
    
    return data.filter(point => 
      point.timestamp >= start && point.timestamp <= end
    );
  }, [data, startDate, endDate]);

  const daysDifference = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  // Process daily data for segmented chart
  const dailyData = useMemo(() => {
    if (filteredData.length === 0) return [];

    const dailyMap = new Map<string, { points: DataPoint[], date: Date }>();

    filteredData.forEach(point => {
      const dateKey = point.timestamp.toISOString().split('T')[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { points: [], date: new Date(dateKey) });
      }
      dailyMap.get(dateKey)?.points.push(point);
    });

    const dailyDataArray: DailyData[] = Array.from(dailyMap.entries()).map(([dateKey, dayInfo]) => {
      const hourlyData = new Map<number, number[]>();
      
      dayInfo.points.forEach(point => {
        const hour = point.timestamp.getHours();
        const pm25 = convertToPM25(point.pm25_cf_1, point.humidity); // Keep outdoor (baseline) exposure
        
        if (!hourlyData.has(hour)) {
          hourlyData.set(hour, []);
        }
        hourlyData.get(hour)?.push(pm25);
      });

      const hours = Array.from(hourlyData.entries()).map(([hour, values]) => {
        const avgPM25 = values.reduce((sum, val) => sum + val, 0) / values.length;
        return {
          hour,
          pm25: avgPM25,
          aqi: convertPM25ToAQI(avgPM25)
        };
      }).sort((a, b) => a.hour - b.hour);

      // Calculate daily AQI average (not PM2.5 average)
      const dailyAverageAQI = hours.reduce((sum, h) => sum + h.aqi, 0) / hours.length;

      return {
        date: dateKey,
        average: dailyAverageAQI, // Now storing AQI average instead of PM2.5 average
        hours
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return dailyDataArray;
  }, [filteredData]);

  // Process sleep-adjusted daily data
  const sleepAdjustedData = useMemo(() => {
    if (!showSleepOverlay || filteredData.length === 0) return [];

    const dailyMap = new Map<string, { points: DataPoint[], date: Date }>();

    filteredData.forEach(point => {
      const dateKey = point.timestamp.toISOString().split('T')[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { points: [], date: new Date(dateKey) });
      }
      dailyMap.get(dateKey)?.points.push(point);
    });

    const sleepDataArray: DailyData[] = Array.from(dailyMap.entries()).map(([dateKey, dayInfo]) => {
      const hourlyData = new Map<number, number[]>();
      
      dayInfo.points.forEach(point => {
        const hour = point.timestamp.getHours();
        let pm25 = convertToPM25(point.pm25_cf_1, point.humidity);
        
        // Apply sleep condition reduction for hours 20:00-06:00 (8pm-6am)
        if (hour >= 20 || hour < 6) {
          pm25 = pm25 * sleepConditions[selectedSleepCondition].factor;
        }
        
        if (!hourlyData.has(hour)) {
          hourlyData.set(hour, []);
        }
        hourlyData.get(hour)?.push(pm25);
      });

      const hours = Array.from(hourlyData.entries()).map(([hour, values]) => {
        const avgPM25 = values.reduce((sum, val) => sum + val, 0) / values.length;
        return {
          hour,
          pm25: avgPM25,
          aqi: convertPM25ToAQI(avgPM25)
        };
      }).sort((a, b) => a.hour - b.hour);

      // Calculate daily AQI average (not PM2.5 average) for sleep data
      const dailyAverageAQI = hours.reduce((sum, h) => sum + h.aqi, 0) / hours.length;

      return {
        date: dateKey,
        average: dailyAverageAQI, // Now storing AQI average instead of PM2.5 average
        hours
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sleepDataArray;
  }, [filteredData, selectedSleepCondition, showSleepOverlay]);

  // Process exercise-adjusted daily data
  const exerciseAdjustedData = useMemo(() => {
    if (!showExerciseOverlay || filteredData.length === 0) return [];

    const dailyMap = new Map<string, { points: DataPoint[], date: Date }>();

    filteredData.forEach(point => {
      const dateKey = point.timestamp.toISOString().split('T')[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { points: [], date: new Date(dateKey) });
      }
      dailyMap.get(dateKey)?.points.push(point);
    });

    const exerciseDataArray: DailyData[] = Array.from(dailyMap.entries()).map(([dateKey, dayInfo]) => {
      const hourlyData = new Map<number, number[]>();
      
      dayInfo.points.forEach(point => {
        const hour = point.timestamp.getHours();
        let pm25 = convertToPM25(point.pm25_cf_1, point.humidity);
        
        // Apply exercise condition multiplier for work hours 6am-6pm (6:00-18:00)
        if (hour >= 6 && hour < 18) {
          // Calculate exposure multiplier based on ventilation rates
          // At rest: 7.5 L/min, exercise increases exposure proportionally
          const restVentilation = 7.5; // L/min
          const exerciseVentilation = exerciseConditions[selectedExerciseCondition].ventilationRate;
          const exposureMultiplier = exerciseVentilation / restVentilation;
          pm25 = pm25 * exposureMultiplier;
        }
        
        if (!hourlyData.has(hour)) {
          hourlyData.set(hour, []);
        }
        hourlyData.get(hour)?.push(pm25);
      });

      const hours = Array.from(hourlyData.entries()).map(([hour, values]) => {
        const avgPM25 = values.reduce((sum, val) => sum + val, 0) / values.length;
        return {
          hour,
          pm25: avgPM25,
          aqi: convertPM25ToAQI(avgPM25)
        };
      }).sort((a, b) => a.hour - b.hour);

      // Calculate daily AQI average (not PM2.5 average) for exercise data
      const dailyAverageAQI = hours.reduce((sum, h) => sum + h.aqi, 0) / hours.length;

      return {
        date: dateKey,
        average: dailyAverageAQI, // Now storing AQI average instead of PM2.5 average
        hours
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return exerciseDataArray;
  }, [filteredData, selectedExerciseCondition, showExerciseOverlay]);

  // Calculate overall average for the summary section
  const overallAverage = useMemo(() => {
    if (dailyData.length === 0) return 0;
    return dailyData.reduce((sum, day) => sum + day.average, 0) / dailyData.length;
  }, [dailyData]);

  // Calculate maximum hourly AQI across all days
  const maxHourlyAQI = useMemo(() => {
    if (dailyData.length === 0) return 0;
    let maxAQI = 0;
    dailyData.forEach(day => {
      day.hours.forEach(hour => {
        if (hour.aqi > maxAQI) {
          maxAQI = hour.aqi;
        }
      });
    });
    return Math.round(maxAQI);
  }, [dailyData]);

  // Calculate hours above WHO standard (15 μg/m³ for PM2.5)
  const whoViolationHours = useMemo(() => {
    if (filteredData.length === 0) return 0;
    
    const violatingPoints = filteredData.filter(point => {
      const pm25 = convertToPM25(point.pm25_cf_1, point.humidity);
      return pm25 > 15; // WHO guideline for PM2.5 (using outdoor baseline)
    });
    
    return (violatingPoints.length * 10) / 60; // 10-minute intervals to hours
  }, [filteredData]);

  // Calculate percentage of time above WHO standard
  const whoViolationPercentage = useMemo(() => {
    if (filteredData.length === 0) return 0;
    
    const totalHours = (filteredData.length * 10) / 60; // Total hours of data
    return totalHours > 0 ? (whoViolationHours / totalHours) * 100 : 0;
  }, [filteredData, whoViolationHours]);

  // Calculate daily exercise exposure effects
  const dailyExerciseEffects = useMemo(() => {
    if (!showExerciseOverlay || dailyData.length === 0) return [];
    
    return dailyData.map(day => {
      // Calculate excess exposure during work hours (6am-6pm)
      const workHours = day.hours.filter(hour => hour.hour >= 6 && hour.hour < 18);
      const restHours = day.hours.filter(hour => hour.hour < 6 || hour.hour >= 18);
      
      // Base exposure (at rest rate)
      const baseWorkExposure = workHours.reduce((sum, h) => sum + h.pm25, 0);
      
      // Exercise-adjusted exposure
      const restVentilation = 7.5; // L/min
      const exerciseVentilation = exerciseConditions[selectedExerciseCondition].ventilationRate;
      const exposureMultiplier = exerciseVentilation / restVentilation;
      const exerciseWorkExposure = baseWorkExposure * exposureMultiplier;
      
      // Excess exposure from exercise/work
      const excessExposure = exerciseWorkExposure - baseWorkExposure;
      
      // Total daily exposure (rest hours + exercise hours)
      const restExposure = restHours.reduce((sum, h) => sum + h.pm25, 0);
      const totalExerciseExposure = restExposure + exerciseWorkExposure;
      const baselineExposure = day.hours.reduce((sum, h) => sum + h.pm25, 0);
      
      return {
        date: day.date,
        excessExposure: excessExposure,
        totalExerciseExposure: totalExerciseExposure,
        baselineExposure: baselineExposure,
        exerciseMultiplier: exposureMultiplier,
        workHoursCount: workHours.length
      };
    });
  }, [dailyData, selectedExerciseCondition, showExerciseOverlay]);

  // Calculate cumulative PM2.5 exposure metrics
  const cumulativeMetrics = useMemo(() => {
    if (filteredData.length === 0) return {
      actualCumulative: 0,
      whoCumulative: 0,
      excessExposure: 0,
      exposureRatio: 0
    };
    
    // Calculate actual cumulative exposure (sum of all PM2.5 readings * time interval)
    const totalActualExposure = filteredData.reduce((sum, point) => {
      const pm25 = convertToPM25(point.pm25_cf_1, point.humidity);
      return sum + pm25;
    }, 0) * (10 / 60); // 10-minute intervals converted to hours
    
    // Calculate WHO-based cumulative exposure (15 μg/m³ * total hours)
    const totalHours = (filteredData.length * 10) / 60; // Convert 10-minute intervals to hours
    const whoBasedCumulative = 15 * totalHours;
    
    // Calculate excess exposure above WHO standard
    const excessExposure = Math.max(0, totalActualExposure - whoBasedCumulative);
    
    // Calculate exposure ratio (actual/WHO standard)
    const exposureRatio = whoBasedCumulative > 0 ? totalActualExposure / whoBasedCumulative : 0;
    
    return {
      actualCumulative: totalActualExposure,
      whoCumulative: whoBasedCumulative,
      excessExposure: excessExposure,
      exposureRatio: exposureRatio
    };
  }, [filteredData]);

  const handleDayClick = (dayData: DailyData) => {
    setSelectedDay(dayData);
  };

  const handleClosePopup = () => {
    setSelectedDay(null);
  };

  // Get AQI color scheme

  // Color code for severity based on hours above WHO standard
  const getSeverityColor = (hours: number): string => {
    if (hours === 0) return '#00e400'; // Good - AQI Green
    if (hours <= 4) return '#ffff00';  // Moderate - AQI Yellow
    if (hours <= 8) return '#ff7e00';  // Unhealthy for Sensitive - AQI Orange
    return '#ff0000'; // Unhealthy - AQI Red
  };

  // Color code for cumulative exposure ratio - matches AQI categories
  const getCumulativeExposureColor = (ratio: number): string => {
    if (ratio <= 1.0) return '#00e400'; // Good - Green
    if (ratio <= 1.5) return '#ffff00'; // Moderate - Yellow  
    if (ratio <= 2.0) return '#ff7e00'; // Unhealthy for Sensitive Groups - Orange
    if (ratio <= 3.0) return '#ff0000'; // Unhealthy - Red
    if (ratio <= 4.0) return '#8f3f97'; // Very Unhealthy - Purple
    return '#7e0023'; // Hazardous - Maroon
  };

  const getCumulativeExposureLabel = (ratio: number): string => {
    if (ratio <= 1.0) return 'Good';
    if (ratio <= 1.5) return 'Moderate';
    if (ratio <= 2.0) return 'Unhealthy for Sensitive Groups';
    if (ratio <= 3.0) return 'Unhealthy';
    if (ratio <= 4.0) return 'Very Unhealthy';
    return 'Hazardous';
  };

  // Color coding for exercise excess exposure (based on excess PM2.5 μg/m³·hrs per day)
  const getExerciseExcessColor = (excessExposure: number): string => {
    if (excessExposure <= 50) return '#00e400';   // Good - Green (minimal excess)
    if (excessExposure <= 150) return '#ffff00';  // Moderate - Yellow
    if (excessExposure <= 300) return '#ff7e00';  // Unhealthy for Sensitive - Orange
    if (excessExposure <= 500) return '#ff0000';  // Unhealthy - Red
    if (excessExposure <= 750) return '#8f3f97';  // Very Unhealthy - Purple
    return '#7e0023'; // Hazardous - Maroon
  };

  const getSeverityLabel = (hours: number): string => {
    if (hours === 0) return 'Good';
    if (hours <= 4) return 'Moderate';
    if (hours <= 8) return 'Unhealthy for Sensitive Groups';
    return 'Unhealthy';
  };

  if (loading) {
    return <div className="loading">Loading data...</div>;
  }

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">PurpleAir Dashboard - Sudbury</h1>
      
      <div className="main-grid">
        {/* Left Column */}
        <div>
          {/* Date Range Selector */}
          <div className="card">
            <h2 className="card-title">Date Range Selection</h2>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Start Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
            <div className="info-box">
              <p className="info-text">
                Selected Period: <strong>{daysDifference} days</strong>
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="card">
            <h2 className="card-title">Summary</h2>
            <div className="stats-grid">
              <div>
                <div className="stat-value text-green-600">{Math.round(overallAverage)}</div>
                <div className="stat-label">Avg AQI</div>
              </div>
              <div>
                <div className="stat-value text-red-600">{maxHourlyAQI}</div>
                <div className="stat-label">Max Hourly AQI</div>
              </div>
              <div>
                <div className="stat-value text-purple-600">{daysDifference}</div>
                <div className="stat-label">Days</div>
              </div>
            </div>
          </div>

          {/* Sleep Conditions Toggle */}
          <div className="card">
            <h2 className="card-title">Sleep Conditions</h2>
            <div className="form-group">
              <label className="radio-item">
                <input
                  type="checkbox"
                  checked={showSleepOverlay}
                  onChange={(e) => setShowSleepOverlay(e.target.checked)}
                  className="radio-input"
                />
                <span className="radio-label">
                  Enable Sleep Protection Analysis
                </span>
              </label>
            </div>
            
            {showSleepOverlay && (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '6px', color: '#374151', marginTop: '12px' }}>
                  Sleep Protection Type (8pm-6am)
                </h3>
                <div className="radio-group">
                  {sleepConditions.map((condition, index) => (
                    <label key={index} className="radio-item">
                      <input
                        type="radio"
                        name="sleepCondition"
                        value={index}
                        checked={selectedSleepCondition === index}
                        onChange={() => setSelectedSleepCondition(index)}
                        className="radio-input"
                      />
                      <span className="radio-label">
                        {condition.name} ({Math.round((1 - condition.factor) * 100)}% reduction)
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Exercise/Work Conditions Toggle */}
          <div className="card">
            <h2 className="card-title">Exercise/Work Conditions</h2>
            <div className="form-group">
              <label className="radio-item">
                <input
                  type="checkbox"
                  checked={showExerciseOverlay}
                  onChange={(e) => setShowExerciseOverlay(e.target.checked)}
                  className="radio-input"
                />
                <span className="radio-label">
                  Enable Exercise/Work Analysis
                </span>
              </label>
            </div>
            
            {showExerciseOverlay && (
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '6px', color: '#374151', marginTop: '12px' }}>
                  Activity Level (6am-6pm)
                </h3>
                <div className="radio-group">
                  {exerciseConditions.map((condition, index) => (
                    <label key={index} className="radio-item">
                      <input
                        type="radio"
                        name="exerciseCondition"
                        value={index}
                        checked={selectedExerciseCondition === index}
                        onChange={() => setSelectedExerciseCondition(index)}
                        className="radio-input"
                      />
                      <span className="radio-label">
                        {condition.name} ({condition.ventilationRate} L/min)
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chart Section */}
          <div className="card" style={{paddingTop: '16px', paddingBottom: '16px'}}>
            <div className="chart-section" style={{margin: '0px', padding: '0px'}}>
              <div style={{margin: '0px', padding: '0px'}}>
                <h2 className="card-title" style={{margin: '0px', padding: '0px', marginBottom: '2px'}}>Daily AQI Exposure (24-hour Outdoor Baseline)</h2>
                {(showSleepOverlay || showExerciseOverlay) && (
                  <p className="chart-subtitle" style={{fontSize: '0.875rem', color: '#6b7280', margin: '0px', padding: '2px 0px'}}>
                    {showSleepOverlay && showExerciseOverlay && "Inner: 24h outdoor | Middle: Sleep-adjusted | Outer: Exercise/Work"}
                    {showSleepOverlay && !showExerciseOverlay && "Inner circle: 24-hour outdoor | Outer ring: Sleep-adjusted"}
                    {!showSleepOverlay && showExerciseOverlay && "Inner circle: 24-hour outdoor | Outer ring: Exercise/Work"}
                  </p>
                )}
                <div className="chart-container" style={{margin: '0px', padding: '0px', marginTop: '2px'}}>
                  <SegmentedHalfCircle 
                    dailyData={dailyData} 
                    sleepData={showSleepOverlay ? sleepAdjustedData : undefined}
                    exerciseData={showExerciseOverlay ? exerciseAdjustedData : undefined}
                    onSegmentClick={handleDayClick}
                  />
                </div>
                <div className="chart-note" style={{margin: '0px', padding: '2px 0px 0px 0px'}}>
                  Click any day for hourly details
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Air Quality Analysis */}
          <div className="card">
            <h2 className="card-title">Air Quality Analysis</h2>
            
            {/* WHO Violation Hours */}
            <div className="severity-container" style={{marginBottom: '20px'}}>
              <div 
                className="severity-display"
                style={{backgroundColor: getSeverityColor(whoViolationHours)}}
              >
                <div className="severity-hours">{whoViolationHours.toFixed(1)} hrs</div>
                <div className="severity-label">Above WHO Standard</div>
              </div>
              <div className="severity-level">
                <span className="severity-level-text">
                  {getSeverityLabel(whoViolationHours)} ({whoViolationPercentage.toFixed(1)}% of time)
                </span>
              </div>
            </div>
            
            {/* Cumulative Exposure */}
            <div className="severity-container" style={{marginBottom: '20px'}}>
              <div 
                className="severity-display"
                style={{backgroundColor: getCumulativeExposureColor(cumulativeMetrics.exposureRatio)}}
              >
                <div className="severity-hours">{cumulativeMetrics.exposureRatio.toFixed(1)}x</div>
                <div className="severity-label">WHO Cumulative Ratio</div>
              </div>
              <div className="severity-level">
                <span className="severity-level-text">
                  {getCumulativeExposureLabel(cumulativeMetrics.exposureRatio)}
                </span>
              </div>
            </div>
            
            {/* Detailed Cumulative Metrics */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ 
                textAlign: 'center', 
                padding: '12px', 
                backgroundColor: '#f3f4f6', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>
                  {Math.round(cumulativeMetrics.actualCumulative)}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3' }}>Actual Cumulative<br/>μg/m³·hrs</div>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                padding: '12px', 
                backgroundColor: '#f3f4f6', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#22c55e' }}>
                  {Math.round(cumulativeMetrics.whoCumulative)}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3' }}>WHO Standard<br/>μg/m³·hrs</div>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                padding: '12px', 
                backgroundColor: '#f3f4f6', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                gridColumn: '1 / -1'
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f97316' }}>
                  {Math.round(cumulativeMetrics.excessExposure)}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3' }}>Excess Exposure Above WHO μg/m³·hrs</div>
              </div>
            </div>
              
            {/* AQI Category Legend */}
            <div className="severity-legend">
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#00e400'}}></div>
                <div className="legend-text">Good</div>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#ffff00'}}></div>
                <div className="legend-text">Moderate</div>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#ff7e00'}}></div>
                <div className="legend-text">Sensitive</div>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#ff0000'}}></div>
                <div className="legend-text">Unhealthy</div>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#8f3f97'}}></div>
                <div className="legend-text">Very Unhealthy</div>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{backgroundColor: '#7e0023'}}></div>
                <div className="legend-text">Hazardous</div>
              </div>
            </div>
          </div>

          {/* Exercise/Work Impact Ribbon */}
          {showExerciseOverlay && dailyExerciseEffects.length > 0 && (
            <div className="card">
              <h2 className="card-title">Exercise/Work Impact Summary</h2>
              <div style={{ marginBottom: '12px', fontSize: '0.875rem', color: '#6b7280' }}>
                Daily excess exposure from {exerciseConditions[selectedExerciseCondition].name.toLowerCase()} during work hours (6am-6pm)
              </div>
              
              {/* Daily Exercise Impact Ribbon */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', 
                gap: '2px',
                marginBottom: '12px'
              }}>
                {dailyExerciseEffects.map((effect, index) => (
                  <div
                    key={effect.date}
                    style={{
                      backgroundColor: getExerciseExcessColor(effect.excessExposure),
                      height: '30px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: effect.excessExposure > 300 ? 'white' : 'black',
                      cursor: 'pointer',
                      border: '1px solid #e5e7eb'
                    }}
                    title={`${new Date(effect.date).toLocaleDateString()}: +${Math.round(effect.excessExposure)} μg/m³·hrs excess`}
                  >
                    {Math.round(effect.excessExposure)}
                  </div>
                ))}
              </div>
              
              {/* Summary Stats */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '8px',
                marginBottom: '12px'
              }}>
                <div style={{ 
                  textAlign: 'center', 
                  padding: '8px', 
                  backgroundColor: '#f3f4f6', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f97316' }}>
                    {Math.round(dailyExerciseEffects.reduce((sum, effect) => sum + effect.excessExposure, 0))}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>Total Excess μg/m³·hrs</div>
                </div>
                
                <div style={{ 
                  textAlign: 'center', 
                  padding: '8px', 
                  backgroundColor: '#f3f4f6', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
                    {dailyExerciseEffects.length > 0 ? (exerciseConditions[selectedExerciseCondition].ventilationRate / 7.5).toFixed(1) : '0'}x
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>Exposure Multiplier</div>
                </div>
              </div>
              
              {/* Legend for ribbon colors */}
              <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3' }}>
                <strong>Color Scale (excess μg/m³·hrs/day):</strong><br/>
                <span style={{color: '#00e400'}}>■</span> ≤50 
                <span style={{color: '#ffff00', marginLeft: '8px'}}>■</span> 51-150 
                <span style={{color: '#ff7e00', marginLeft: '8px'}}>■</span> 151-300 
                <span style={{color: '#ff0000', marginLeft: '8px'}}>■</span> 301-500 
                <span style={{color: '#8f3f97', marginLeft: '8px'}}>■</span> 501-750 
                <span style={{color: '#7e0023', marginLeft: '8px'}}>■</span> {'>'}750
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Daily Detail Popup */}
      {selectedDay && (
        <DailyDetailPopup 
          dayData={selectedDay} 
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
};

export default PurpleAirDashboard;