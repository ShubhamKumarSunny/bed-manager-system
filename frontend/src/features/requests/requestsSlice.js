import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async Thunks
export const fetchRequests = createAsyncThunk('requests/fetchAll', async () => {
  const res = await api.get('/emergency-requests');
  return res.data;
});

export const approveRequest = createAsyncThunk(
  'requests/approve',
  async ({ id, bedId }) => {
    const res = await api.patch(`/emergency-requests/${id}/approve`, { bedId });
    return res.data.data.emergencyRequest;
  }
);

export const rejectRequest = createAsyncThunk(
  'requests/reject',
  async ({ id, rejectionReason }) => {
    const res = await api.patch(`/emergency-requests/${id}/reject`, { rejectionReason });
    return res.data.data.emergencyRequest;
  }
);

export const updateRequestStatus = createAsyncThunk(
  'requests/updateStatus',
  async ({ id, status }) => {
    const res = await api.patch(`/emergency-requests/${id}`, { status });
    return res.data;
  }
);

const requestsSlice = createSlice({
  name: 'requests',
  initialState: {
    requests: [],
    selectedRequest: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    selectRequest: (state, action) => {
      state.selectedRequest = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRequests.pending, (state) => {
        // Background refreshes keep showing the current list instead of a spinner
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchRequests.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Handle backend response structure: { success, count, data: { emergencyRequests } }
        const requests = action.payload?.data?.emergencyRequests || action.payload?.emergencyRequests || action.payload || [];
        state.requests = Array.isArray(requests) ? requests : [];
      })
      .addCase(fetchRequests.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(approveRequest.fulfilled, (state, action) => {
        const idx = state.requests.findIndex(r => r._id === action.payload._id);
        if (idx >= 0) state.requests[idx] = action.payload;
      })
      .addCase(rejectRequest.fulfilled, (state, action) => {
        const idx = state.requests.findIndex(r => r._id === action.payload._id);
        if (idx >= 0) state.requests[idx] = action.payload;
      })
      .addCase(updateRequestStatus.fulfilled, (state, action) => {
        const idx = state.requests.findIndex(r => r._id === action.payload._id);
        if (idx >= 0) state.requests[idx] = action.payload;
      });
  },
});

export const { selectRequest } = requestsSlice.actions;
export default requestsSlice.reducer;
