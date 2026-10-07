# Analytics API Documentation

## Overview

The Analytics API provides comprehensive reporting and forecasting endpoints for hospital bed management. All endpoints are currently public (no authentication required) for MVP, but should be protected with role-based access control in production.

## Base URL

```
http://localhost:5001/api/analytics
```

---

## Endpoints

### 1. Occupancy Summary

Get overall occupancy metrics for the entire hospital.

**Endpoint:** `GET /occupancy-summary`

**Query Parameters:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBeds": 192,
      "occupied": 145,
      "available": 32,
      "maintenance": 10,
      "reserved": 5,
      "occupancyPercentage": 76
    }
  }
}
```

**Use Case:** Hospital dashboard KPI cards, real-time occupancy status

---

### 2. Occupancy by Ward

Get occupancy breakdown for each ward.

**Endpoint:** `GET /occupancy-by-ward`

**Query Parameters:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "wardBreakdown": [
      {
        "ward": "Emergency",
        "totalBeds": 84,
        "occupied": 60,
        "available": 15,
        "maintenance": 5,
        "reserved": 4,
        "occupancyPercentage": 71
      },
      {
        "ward": "General",
        "totalBeds": 84,
        "occupied": 65,
        "available": 12,
        "maintenance": 3,
        "reserved": 4,
        "occupancyPercentage": 77
      },
      {
        "ward": "ICU",
        "totalBeds": 24,
        "occupied": 20,
        "available": 3,
        "maintenance": 1,
        "reserved": 0,
        "occupancyPercentage": 83
      }
    ]
  }
}
```

**Use Case:** Ward-level KPIs, comparing occupancy across units, capacity planning

---

### 3. Bed History

Get complete status change history for a specific bed.

**Endpoint:** `GET /bed-history/:bedId`

**Path Parameters:**

- `bedId` - MongoDB ObjectId OR bed identifier string (e.g., "iA5", "BED-101")

**Query Parameters:**

- `limit` - (optional) Number of records to return (default: 50, max: 200)
- `skip` - (optional) Number of records to skip for pagination (default: 0)

**Example:**

```
GET /api/analytics/bed-history/iA5?limit=25&skip=0
GET /api/analytics/bed-history/507f1f77bcf86cd799439011?limit=50
```

**Response:**

```json
{
  "success": true,
  "data": {
    "bed": {
      "_id": "507f1f77bcf86cd799439011",
      "bedId": "iA5",
      "ward": "ICU",
      "currentStatus": "occupied"
    },
    "history": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "bedId": "507f1f77bcf86cd799439011",
        "userId": {
          "_id": "607f1f77bcf86cd799439015",
          "name": "John Doe",
          "email": "john@hospital.com",
          "role": "ward_staff"
        },
        "timestamp": "2025-11-05T14:30:00.000Z",
        "statusChange": "assigned",
        "createdAt": "2025-11-05T14:30:00.000Z",
        "updatedAt": "2025-11-05T14:30:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "bedId": "507f1f77bcf86cd799439011",
        "userId": {
          "_id": "607f1f77bcf86cd799439016",
          "name": "Jane Smith",
          "email": "jane@hospital.com",
          "role": "ward_staff"
        },
        "timestamp": "2025-11-04T10:15:00.000Z",
        "statusChange": "released",
        "createdAt": "2025-11-04T10:15:00.000Z",
        "updatedAt": "2025-11-04T10:15:00.000Z"
      }
    ],
    "pagination": {
      "total": 42,
      "limit": 25,
      "skip": 0,
      "hasMore": true
    }
  }
}
```

**Status Change Types:**

- `assigned` - Bed marked as occupied (patient admitted)
- `released` - Bed marked as available (patient discharged)
- `maintenance_start` - Bed marked for maintenance
- `maintenance_end` - Bed maintenance completed
- `reserved` - Bed reserved for upcoming admission
- `reservation_cancelled` - Reservation cancelled

**Use Case:** Bed audit trails, patient history tracking, compliance reporting

---

### 4. Occupancy Trends

Get occupancy trends over a time period with configurable granularity.

**Endpoint:** `GET /occupancy-trends`

**Query Parameters:**

- `startDate` - (optional) ISO 8601 format (e.g., "2025-10-05T00:00:00Z"), default: 30 days ago
- `endDate` - (optional) ISO 8601 format, default: now
- `granularity` - (optional) "hourly" | "daily" | "weekly" (default: "daily")

**Example:**

```
GET /api/analytics/occupancy-trends?startDate=2025-10-05&endDate=2025-11-05&granularity=daily
```

**Response:**

```json
{
  "success": true,
  "data": {
    "timeRange": {
      "start": "2025-10-05T00:00:00.000Z",
      "end": "2025-11-05T00:00:00.000Z",
      "granularity": "daily"
    },
    "totalBeds": 192,
    "trends": [
      {
        "_id": "2025-10-05",
        "count": 45,
        "assignedCount": 28,
        "releasedCount": 17
      },
      {
        "_id": "2025-10-06",
        "count": 52,
        "assignedCount": 32,
        "releasedCount": 20
      },
      {
        "_id": "2025-10-07",
        "count": 48,
        "assignedCount": 30,
        "releasedCount": 18
      }
    ]
  }
}
```

**Use Case:** Time series charts, occupancy trend analysis, peak demand visualization

---

### 5. Forecasting

Get predictions for discharges, capacity needs, and availability forecasts.

**Endpoint:** `GET /forecasting`

**Query Parameters:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "currentMetrics": {
      "totalBeds": 192,
      "occupiedBeds": 145,
      "availableBeds": 47,
      "occupancyPercentage": 76
    },
    "expectedDischarges": {
      "next24Hours": 18,
      "next48Hours": 27,
      "next72Hours": 48,
      "note": "Based on average length of stay estimates"
    },
    "averageLengthOfStay": {
      "days": 3.2,
      "note": "Average length of stay (last 30 days)"
    },
    "wardForecast": [
      {
        "ward": "Emergency",
        "totalBeds": 84,
        "occupiedBeds": 60,
        "availableBeds": 24,
        "occupancyPercentage": 71,
        "predictedDischarges": 19
      },
      {
        "ward": "General",
        "totalBeds": 84,
        "occupiedBeds": 65,
        "availableBeds": 19,
        "occupancyPercentage": 77,
        "predictedDischarges": 20
      },
      {
        "ward": "ICU",
        "totalBeds": 24,
        "occupiedBeds": 20,
        "availableBeds": 4,
        "occupancyPercentage": 83,
        "predictedDischarges": 6
      }
    ],
    "timestamp": "2025-11-05T15:30:00.000Z",
    "disclaimer": "Forecasting is based on historical trends and may not account for emergency admissions or unscheduled discharges"
  }
}
```

**Use Case:** Capacity planning, staffing recommendations, discharge forecasting, bed availability prediction

---

## Error Responses

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (only in development mode)"
}
```

### Common Error Codes

| Status | Message |
|--------|---------|
| 400 | Invalid query parameters or date format |
| 404 | Bed not found |
| 500 | Server error |

---

## Example Usage

### Get Hospital Occupancy Overview

```bash
curl -X GET "http://localhost:5001/api/analytics/occupancy-summary"
```

### Get Trends for Last 7 Days

```bash
curl -X GET "http://localhost:5001/api/analytics/occupancy-trends?granularity=daily&startDate=2025-10-29&endDate=2025-11-05"
```

### Get Bed Audit Trail with Pagination

```bash
curl -X GET "http://localhost:5001/api/analytics/bed-history/iA5?limit=20&skip=0"
```

### Get Forecasting Data

```bash
curl -X GET "http://localhost:5001/api/analytics/forecasting"
```

---

## Performance Considerations

- **occupancy-summary**: ~5-10ms (indexed queries)
- **occupancy-by-ward**: ~20-50ms (multiple ward queries)
- **bed-history**: ~50-200ms (depends on record count)
- **occupancy-trends**: ~100-500ms (aggregation pipeline)
- **forecasting**: ~200-800ms (multiple aggregations)

### Indexes

The system uses MongoDB indexes for optimal performance:

```javascript
// Bed collection
{ bedId: 1 } - unique
{ ward: 1 }
{ status: 1 }
{ ward: 1, status: 1 }

// OccupancyLog collection
{ bedId: 1 }
{ userId: 1 }
{ timestamp: -1 }
{ bedId: 1, timestamp: -1 }
{ userId: 1, timestamp: -1 }
```

---

## Future Enhancements

1. **Role-Based Access Control**
   - Add `protect` middleware for authentication
   - ICU Manager: Full access
   - Hospital Admin: Read-only
   - ER Staff: Summary only

2. **Advanced Forecasting**
   - Integrate machine learning models
   - Account for seasonal patterns
   - Emergency admission weighting

3. **Custom Reports**
   - Configurable date ranges
   - Ward-specific reports
   - Export to CSV/PDF

4. **Real-time Analytics**
   - WebSocket updates for live dashboards
   - Alert thresholds (e.g., occupancy > 90%)

5. **Performance Analytics**
   - Average turnover time
   - Admission/discharge patterns
   - Peak demand identification
