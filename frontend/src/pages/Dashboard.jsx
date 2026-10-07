import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentUser, selectIsAuthenticated, logout } from '@/features/auth/authSlice';
import api from '@/services/api';
import {
    Sidebar,
    DesktopSidebar,
    MobileSidebar,
    SidebarBody,
    SidebarLink,
    Logo,
    LogoIcon,
    ProfileLink,
} from "@/components/ui/sidebar";
import { Home, Settings, Users, BarChart2, Bell } from "lucide-react";
import { motion, AnimatePresence } from 'framer-motion';
import { BedSelection } from '@/components/ui/bed-selection';
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// Helper to generate beds for a row
const generateBeds = (start, end, rowId) => {
    const beds = [];
    for (let i = start; i <= end; i++) beds.push({ id: `${rowId}${i}`, number: i });
    return beds;
};

const bedLayoutData = [
    {
        categoryName: 'ICU',
        rows: [
            { rowId: 'iA', beds: [...generateBeds(1, 6, 'iA'), { id: 'iA-spacer', isSpacer: true }, ...generateBeds(7, 12, 'iA')] },
            { rowId: 'iB', beds: [...generateBeds(1, 6, 'iB'), { id: 'iB-spacer', isSpacer: true }, ...generateBeds(7, 12, 'iB')] },

        ],
    },
    {
        categoryName: 'FLOOR 1',
        rows: [
            { rowId: 'A', beds: [...generateBeds(1, 9, 'A'), { id: 'A-spacer', isSpacer: true }, ...generateBeds(10, 21, 'A')] },
            { rowId: 'B', beds: [...generateBeds(1, 9, 'B'), { id: 'B-spacer', isSpacer: true }, ...generateBeds(10, 21, 'B')] },
            { rowId: 'C', beds: [...generateBeds(1, 9, 'C'), { id: 'C-spacer', isSpacer: true }, ...generateBeds(10, 21, 'C')] },
            { rowId: 'D', beds: [...generateBeds(1, 9, 'D'), { id: 'D-spacer', isSpacer: true }, ...generateBeds(10, 21, 'D')] },
        ],
    },
    {
        categoryName: 'FLOOR 2',
        rows: [
            { rowId: 'E', beds: [...generateBeds(1, 9, 'E'), { id: 'E-spacer', isSpacer: true }, ...generateBeds(10, 21, 'E')] },
            { rowId: 'F', beds: [...generateBeds(1, 9, 'F'), { id: 'F-spacer', isSpacer: true }, ...generateBeds(10, 21, 'F')] },
            { rowId: 'G', beds: [...generateBeds(1, 9, 'G'), { id: 'G-spacer', isSpacer: true }, ...generateBeds(10, 21, 'G')] },
            { rowId: 'H', beds: [...generateBeds(1, 9, 'H'), { id: 'H-spacer', isSpacer: true }, ...generateBeds(10, 21, 'H')] },
        ],
    },
];

const Legend = () => (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 p-4 rounded-md border bg-card text-card-foreground">
        <div className="flex items-center gap-2"><div className="w-5 h-5 rounded border-emerald-600 bg-emerald-600" /><span className="text-sm">Available</span></div>
        <div className="flex items-center gap-2"><div className="w-5 h-5 rounded border-primary bg-primary" /><span className="text-sm">Selected</span></div>
        <div className="flex items-center gap-2"><div className="w-5 h-5 rounded border-red-600 bg-red-600" /><span className="text-sm">Occupied</span></div>
    </div>
);

function Dashboard() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const currentUser = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [selectedBeds, setSelectedBeds] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [isBooking, setIsBooking] = useState(false);
    const [occupiedBeds, setOccupiedBeds] = useState([]);
    const [, setAllBeds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    const links = [
        { label: "Overview", href: "#overview", icon: <BarChart2 className="h-4 w-4" /> },
        { label: "Requests", href: "#requests", icon: <Bell className="h-4 w-4" /> },
        {
            label: "Settings",
            href: "#settings",
            icon: <Settings className="h-4 w-4" />,
            onClick: (e) => {
                e.preventDefault();
                setShowSettings(true);
            }
        },
        {
            label: "Logout",
            href: "/login",
            icon: <Home className="h-4 w-4" />,
            onClick: (e) => {
                e.preventDefault();
                // Clear session and logout
                dispatch(logout());
                navigate('/login');
            }
        },
    ];

    // Debug authentication state
    useEffect(() => {
        console.log('Dashboard Auth State:', {
            isAuthenticated,
            currentUser,
            token: localStorage.getItem('authToken'),
            storedUser: localStorage.getItem('user')
        });
    }, [isAuthenticated, currentUser]);

    // Debug occupied beds changes
    useEffect(() => {
        console.log('🔄 Occupied beds updated:', occupiedBeds);
    }, [occupiedBeds]);

    // Fetch beds from backend on mount
    useEffect(() => {
        fetchBeds();
    }, []);

    const fetchBeds = async () => {
        try {
            setLoading(true);
            const response = await api.get('/beds');
            const beds = response.data?.data?.beds || response.data?.beds || [];

            setAllBeds(beds);

            // Extract occupied bed IDs
            const occupied = beds
                .filter(bed => bed.status === 'occupied')
                .map(bed => bed.bedId);
            setOccupiedBeds(occupied);

            console.log('Fetched beds:', beds.length);
            console.log('Occupied bed IDs:', occupied);
            console.log('Sample beds:', beds.slice(0, 5));
        } catch (error) {
            console.error('Error fetching beds:', error);
            // Fallback to hardcoded if API fails
            setOccupiedBeds(['F17', 'F18', 'F19', 'iA1', 'C2', 'C10', 'C11', 'E9']);
        } finally {
            setLoading(false);
        }
    };

    const filteredLayout = useMemo(() => {
        if (selectedCategory === 'ALL') return bedLayoutData;
        return bedLayoutData.filter((c) => c.categoryName === selectedCategory);
    }, [selectedCategory]);

    const categories = useMemo(() => ['ALL', ...bedLayoutData.map(c => c.categoryName)], []);

    const handleBedSelect = (bedId) => {
        // Prevent selecting occupied beds
        if (occupiedBeds.includes(bedId)) {
            alert(`Bed ${bedId} is already occupied and cannot be selected.`);
            return;
        }
        setSelectedBeds((prev) => prev.includes(bedId) ? prev.filter(id => id !== bedId) : [...prev, bedId]);
    };

    const handleProceedToBook = async () => {
        if (selectedBeds.length === 0) {
            alert("Please select at least one bed to proceed.");
            return;
        }

        // Check if user is logged in
        if (!isAuthenticated || !currentUser) {
            alert("Please log in to book beds.");
            navigate('/login');
            return;
        }

        // Staff can assign beds - prompt for patient information
        const patientName = prompt("Enter patient name:");
        if (!patientName || patientName.trim() === '') {
            alert("Patient name is required to assign a bed.");
            return;
        }

        const patientId = prompt("Enter patient ID (optional):");

        // Double-check no occupied beds are selected
        const invalidBeds = selectedBeds.filter(bedId => occupiedBeds.includes(bedId));
        if (invalidBeds.length > 0) {
            alert(`Cannot book occupied beds: ${invalidBeds.join(', ')}`);
            setSelectedBeds(selectedBeds.filter(bedId => !occupiedBeds.includes(bedId)));
            return;
        }

        setIsBooking(true);

        try {
            const results = [];
            const errors = [];
            const successfulBedIds = [];

            // Book each bed via backend API
            for (const bedId of selectedBeds) {
                try {
                    console.log(`Booking bed ${bedId}...`);
                    const response = await api.patch(`/beds/${bedId}/status`, {
                        status: 'occupied',
                        patientName: patientName.trim(),
                        patientId: patientId?.trim() || null
                    });
                    console.log(`✅ Bed ${bedId} booked successfully:`, response.data);
                    results.push({ bedId, success: true, data: response.data });
                    successfulBedIds.push(bedId);
                } catch (error) {
                    console.error(`Failed to book bed ${bedId}:`, error);
                    console.error('Error response:', error.response?.data);
                    const errorMsg = error.response?.data?.message ||
                        error.response?.data?.errors?.[0]?.message ||
                        'Booking failed';
                    errors.push({ bedId, error: errorMsg });
                }
            }

            // Update occupied beds with successful bookings
            if (successfulBedIds.length > 0) {
                setOccupiedBeds(prev => {
                    const updated = [...new Set([...prev, ...successfulBedIds])];
                    console.log('Updated occupied beds:', updated);
                    return updated;
                });
            }

            // Show results
            if (errors.length === 0) {
                alert(`✅ Successfully booked ${results.length} bed(s):\n${selectedBeds.join(', ')}`);
                setSelectedBeds([]);

                // Refresh bed data from backend to ensure consistency
                console.log('Refreshing bed data from backend...');
                await fetchBeds();
            } else {
                const successCount = results.length;
                const errorCount = errors.length;
                const errorDetails = errors.map(e => `${e.bedId}: ${e.error}`).join('\n');

                alert(
                    `Booking completed with some errors:\n\n` +
                    `✅ Success: ${successCount} bed(s)\n` +
                    `❌ Failed: ${errorCount} bed(s)\n\n` +
                    `Failed beds:\n${errorDetails}`
                );

                // Remove successfully booked beds from selection
                const failedBedIds = errors.map(e => e.bedId);
                setSelectedBeds(failedBedIds);

                // Refresh bed data from backend
                await fetchBeds();
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Failed to process booking. Please try again.');
        } finally {
            setIsBooking(false);
        }
    };

    // Pricing removed for hospital bed allocation; no totalPrice calculation

    return (
        <Sidebar>
            <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
                <SidebarBody className="flex-col justify-between">
                    <div className="flex flex-col gap-2">
                        {/* Logo */}
                        <div className="mt-2"><Logo /></div>

                        <div className="mt-6 flex flex-col gap-2 px-1">
                            {links.map((l) => (
                                <SidebarLink key={l.href} link={l} className="rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800" />
                            ))}
                        </div>
                    </div>

                    {/* Profile */}
                    <div className="mb-4">
                        <ProfileLink />
                    </div>
                </SidebarBody>

                <div className="flex-1 p-8 overflow-auto">
                    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-between mb-6 gap-4">
                        <div className="w-full md:w-auto text-center md:text-left">
                            <h1 className="text-4xl font-bold">Dashboard</h1>
                            <p className="text-md text-neutral-600 dark:text-neutral-300">
                                {loading ? 'Loading beds...' : `Select available beds to book`}
                            </p>
                        </div>

                        <div className="flex gap-2 items-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchBeds}
                                disabled={loading}
                            >
                                {loading ? 'Refreshing...' : 'Refresh'}
                            </Button>
                            <div className="w-48">
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Show All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat === 'ALL' ? 'Show All' : cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                                    <p className="text-neutral-600 dark:text-neutral-400">Loading beds...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <BedSelection
                                    key={`${selectedCategory}-${occupiedBeds.length}`}
                                    layout={filteredLayout}
                                    selectedBeds={selectedBeds}
                                    occupiedBeds={occupiedBeds}
                                    onBedSelect={handleBedSelect}
                                />

                                <Legend />

                                <AnimatePresence>
                                    {selectedBeds.length > 0 && (
                                        <motion.div
                                            className="mt-8 w-full max-w-md p-4 bg-card border rounded-lg shadow-lg"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 20 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <h3 className="text-lg font-semibold mb-2 text-foreground">Your Selection</h3>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {selectedBeds.slice().sort().map(bedId => (
                                                    <span key={bedId} className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1 rounded-full">
                                                        {bedId}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="border-t pt-4" />
                                            <Button
                                                className="w-full mt-4"
                                                onClick={handleProceedToBook}
                                                disabled={isBooking}
                                            >
                                                {isBooking ? 'Processing...' : 'Proceed to Book'}
                                            </Button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSettings(false)}>
                    <div className="bg-neutral-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold text-white">User Profile</h2>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="text-zinc-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-zinc-400">Name</label>
                                <p className="text-white font-medium">{currentUser?.name || 'N/A'}</p>
                            </div>

                            <div>
                                <label className="text-sm text-zinc-400">Email</label>
                                <p className="text-white font-medium">{currentUser?.email || 'N/A'}</p>
                            </div>

                            <div>
                                <label className="text-sm text-zinc-400">Role</label>
                                <p className="text-white font-medium capitalize">
                                    {currentUser?.role?.replace(/_/g, ' ') || 'N/A'}
                                </p>
                            </div>

                            <div>
                                <label className="text-sm text-zinc-400">User ID</label>
                                <p className="text-white font-mono text-xs">{currentUser?.id || 'N/A'}</p>
                            </div>
                        </div>

                        <div className="mt-6 flex gap-2">
                            <Button
                                onClick={() => setShowSettings(false)}
                                className="flex-1"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Sidebar>
    );
}

export default Dashboard;
