import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Initial state
const initialState = {
  bedsList: [],
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
  updateStatus: 'idle', // Track individual bed update status
};

// Async thunk to fetch all beds
export const fetchBeds = createAsyncThunk(
  'beds/fetchBeds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/beds');
      // API returns { success: true, data: { beds: [...] } }
      return response.data.data?.beds || response.data.data || response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch beds';
      return rejectWithValue(errorMessage);
    }
  }
);

// Async thunk to update bed status
export const updateBedStatus = createAsyncThunk(
  'beds/updateBedStatus',
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/beds/${id}/status`, { status });
      return response.data; // Returns the updated bed object
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update bed status';
      return rejectWithValue(errorMessage);
    }
  }
);

// Beds slice
const bedsSlice = createSlice({
  name: 'beds',
  initialState,
  reducers: {
    // Reducer to update a specific bed in the list (used by socket)
    updateBedInList: (state, action) => {
      const updatedBed = action.payload;
      const index = state.bedsList.findIndex((bed) => bed._id === updatedBed._id);
      
      if (index !== -1) {
        // Update existing bed
        state.bedsList[index] = updatedBed;
      } else {
        // Add new bed if it doesn't exist
        state.bedsList.push(updatedBed);
      }
    },
    // Clear errors
    clearBedsError: (state) => {
      state.error = null;
    },
    // Reset beds state (useful on logout)
    resetBeds: (state) => {
      state.bedsList = [];
      state.status = 'idle';
      state.error = null;
      state.updateStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Beds
      .addCase(fetchBeds.pending, (state) => {
        // Background refreshes keep showing the current grid instead of a spinner
        if (state.status !== 'succeeded') state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBeds.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.bedsList = action.payload;
        state.error = null;
      })
      .addCase(fetchBeds.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      // Update Bed Status
      .addCase(updateBedStatus.pending, (state) => {
        state.updateStatus = 'loading';
      })
      .addCase(updateBedStatus.fulfilled, (state, action) => {
        state.updateStatus = 'succeeded';
        // Update the bed in the list
        const updatedBed = action.payload;
        const index = state.bedsList.findIndex((bed) => bed._id === updatedBed._id);
        if (index !== -1) {
          state.bedsList[index] = updatedBed;
        }
      })
      .addCase(updateBedStatus.rejected, (state, action) => {
        state.updateStatus = 'failed';
        state.error = action.payload;
      });
  },
});

// Export actions
export const { updateBedInList, clearBedsError, resetBeds } = bedsSlice.actions;

// Selectors
export const selectAllBeds = (state) => state.beds.bedsList;
export const selectBedsStatus = (state) => state.beds.status;
export const selectBedsError = (state) => state.beds.error;
export const selectBedUpdateStatus = (state) => state.beds.updateStatus;

// Selector to get beds by status
export const selectBedsByStatus = (status) => (state) =>
  state.beds.bedsList.filter((bed) => bed.status === status);

// Selector to get a specific bed by ID
export const selectBedById = (bedId) => (state) =>
  state.beds.bedsList.find((bed) => bed._id === bedId);

// Selector to get bed statistics
export const selectBedStats = (state) => {
  const beds = state.beds.bedsList;
  return {
    total: beds.length,
    available: beds.filter((bed) => bed.status === 'available').length,
    occupied: beds.filter((bed) => bed.status === 'occupied').length,
    maintenance: beds.filter((bed) => bed.status === 'maintenance').length,
  };
};

// Export reducer
export default bedsSlice.reducer;
