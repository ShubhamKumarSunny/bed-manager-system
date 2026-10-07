// frontend/src/pages/Profile.jsx
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { User, Mail, Phone, MapPin, Calendar, Briefcase, FileText, Camera, Edit2, Save, X, Shield, ArrowLeft } from 'lucide-react';
import { updateUserProfile, logout } from '../features/auth/authSlice';
import api from '../services/api';
import { assetUrl } from '../services/config';
import Toast from '../components/ui/Toast';

const Profile = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    dateOfBirth: '',
    bio: '',
    department: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/profile');

      if (response.data.success && response.data.data) {
        setProfileData(response.data.data);
        setFormData({
          name: response.data.data.name || '',
          phone: response.data.data.phone || '',
          address: response.data.data.address || '',
          dateOfBirth: response.data.data.dateOfBirth ? new Date(response.data.data.dateOfBirth).toISOString().split('T')[0] : '',
          bio: response.data.data.bio || '',
          department: response.data.data.department || ''
        });
        
        if (response.data.data.profilePicture) {
          setImagePreview(assetUrl(response.data.data.profilePicture));
        }
      } else {
        setError('Invalid response from server');
        setProfileData({}); // Set empty object to stop loading
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError(err.response?.data?.message || 'Failed to load profile data');
      setProfileData({}); // Set empty object to stop loading
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Image size must be less than 2MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formDataToSend = new FormData();
      
      // Always send all fields, even if empty
      Object.keys(formData).forEach(key => {
        formDataToSend.append(key, formData[key] || '');
      });
      
      if (imageFile) {
        formDataToSend.append('profilePicture', imageFile);
      }

      const response = await api.put('/profile', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success && response.data.data) {
        setProfileData(response.data.data);
        
        // Update Redux store with new user data (including profile picture)
        dispatch(updateUserProfile({ ...user, ...response.data.data, id: response.data.data._id }));
        
        // Update form data with the response to ensure UI reflects saved data
        setFormData({
          name: response.data.data.name || '',
          phone: response.data.data.phone || '',
          address: response.data.data.address || '',
          dateOfBirth: response.data.data.dateOfBirth ? new Date(response.data.data.dateOfBirth).toISOString().split('T')[0] : '',
          bio: response.data.data.bio || '',
          department: response.data.data.department || ''
        });
        
        if (response.data.data.profilePicture) {
          setImagePreview(assetUrl(response.data.data.profilePicture));
        }
        
        setSuccess('Profile updated successfully!');
        setIsEditing(false);
        setImageFile(null);
        
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setImageFile(null);
    setError('');
    setSuccess('');
    
    // Reset form data
    if (profileData) {
      setFormData({
        name: profileData.name || '',
        phone: profileData.phone || '',
        address: profileData.address || '',
        dateOfBirth: profileData.dateOfBirth ? new Date(profileData.dateOfBirth).toISOString().split('T')[0] : '',
        bio: profileData.bio || '',
        department: profileData.department || ''
      });
      
      if (profileData.profilePicture) {
        setImagePreview(assetUrl(profileData.profilePicture));
      }
    }
  };

  const handleDeletePicture = async () => {
    if (!window.confirm('Are you sure you want to delete your profile picture?')) {
      return;
    }

    try {
      const response = await api.delete('/profile/picture');
      if (response.data?.data) {
        dispatch(updateUserProfile({ ...user, ...response.data.data, id: response.data.data._id }));
      }

      setImagePreview(null);
      setImageFile(null);
      setSuccess('Profile picture deleted successfully');
      fetchProfile();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to delete picture:', err);
      setError(err.response?.data?.message || 'Failed to delete profile picture');
    }
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      hospital_admin: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      ward_staff: 'bg-green-100 text-green-800',
      er_staff: 'bg-red-100 text-red-800',
      technical_team: 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role) => {
    const labels = {
      hospital_admin: 'Hospital Admin',
      manager: 'Manager',
      ward_staff: 'Ward Staff',
      er_staff: 'ER Staff',
      technical_team: 'Technical Team'
    };
    return labels[role] || role;
  };

  // Show loading only initially, not when profileData becomes an empty object
  if (profileData === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="mb-6">
          <Button 
            onClick={() => navigate(-1)} 
            variant="outline" 
            className="flex items-center gap-2 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-neutral-300 dark:border-neutral-700 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
        
        <Card className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <CardHeader className="bg-neutral-800 dark:bg-neutral-950 pb-20 pt-6 border-b border-neutral-700">
          <div className="relative">
            <div className="text-center">
              <CardTitle className="text-2xl md:text-3xl font-bold text-white">Your Profile</CardTitle>
              <CardDescription className="text-neutral-300 dark:text-neutral-400 mt-2">Manage your personal information and settings</CardDescription>
            </div>
            <div className="absolute top-0 right-0 flex gap-2">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button onClick={handleCancel} variant="outline" className="flex items-center gap-2 bg-white/10 dark:bg-neutral-800/50 text-white border-white/30 dark:border-neutral-700 hover:bg-white/20 dark:hover:bg-neutral-800/70">
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={loading} className="flex items-center gap-2 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">
                    <Save className="w-4 h-4" />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Picture Section */}
            <div className="flex flex-col items-center space-y-4 pb-6 -mt-16">
              {error && (
                <div className="w-full max-w-md mt-20 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 rounded-lg text-center">
                  {error}
                </div>
              )}
              
              {success && (
                <div className="w-full max-w-md mt-20 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400 rounded-lg text-center">
                  {success}
                </div>
              )}
              <div className="relative">
                <div className="w-36 h-36 rounded-full overflow-hidden bg-neutral-700 dark:bg-neutral-800 flex items-center justify-center ring-4 ring-neutral-100 dark:ring-neutral-900 shadow-2xl">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-20 h-20 text-white" />
                  )}
                </div>
                
                {isEditing && (
                  <label className="absolute bottom-0 right-0 bg-neutral-800 dark:bg-neutral-700 text-white p-3 rounded-full cursor-pointer hover:bg-neutral-900 dark:hover:bg-neutral-600 transition-all shadow-lg ring-4 ring-neutral-100 dark:ring-neutral-900">
                    <Camera className="w-5 h-5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              
              {isEditing && imagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeletePicture}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
                >
                  Remove Picture
                </Button>
              )}
              
              <div className="text-center">
                <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{profileData?.name || 'User'}</h3>
                <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold mt-3 shadow-md ${getRoleBadgeColor(profileData?.role)}`}>
                  {getRoleLabel(profileData?.role)}
                </span>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-4 pt-6">
              <div className="flex items-center gap-3 pb-3 border-b-2 border-neutral-200 dark:border-neutral-800">
                <div className="p-2 bg-neutral-800 dark:bg-neutral-700 rounded-lg shadow-md">
                  <User className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Basic Information
                </h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <User className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.name || 'Not provided'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2 p-3 bg-neutral-200 dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700">
                    <Mail className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                    <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.email || 'Not provided'}</span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 italic">Email cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+1 (555) 123-4567"
                      className="border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <Phone className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.phone || 'Not provided'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  {isEditing ? (
                    <Input
                      id="dateOfBirth"
                      name="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                      max={new Date().toISOString().split('T')[0]}
                      className="border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <Calendar className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">
                        {profileData?.dateOfBirth 
                          ? new Date(profileData.dateOfBirth).toLocaleDateString()
                          : 'Not provided'
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Work Information */}
            <div className="space-y-4 pt-6 border-t-2 border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3 pb-3">
                <div className="p-2 bg-neutral-800 dark:bg-neutral-700 rounded-lg shadow-md">
                  <Briefcase className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Work Information
                </h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <div className="flex items-center gap-2 p-3 bg-neutral-200 dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700">
                    <Shield className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                    <span className="text-neutral-900 dark:text-neutral-100 font-medium">{getRoleLabel(profileData?.role)}</span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 italic">Role is assigned by admin</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  {isEditing ? (
                    <Input
                      id="department"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      placeholder="e.g., Cardiology, Emergency"
                      className="border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <Briefcase className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.department || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                {profileData?.ward && (
                  <div className="space-y-2">
                    <Label>Assigned Ward</Label>
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <MapPin className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.ward}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-4 pt-6 border-t-2 border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3 pb-3">
                <div className="p-2 bg-neutral-800 dark:bg-neutral-700 rounded-lg shadow-md">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Additional Information
                </h4>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  {isEditing ? (
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="Your address"
                      className="border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-500 focus:ring-neutral-500 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                      <MapPin className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">{profileData?.address || 'Not provided'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  {isEditing ? (
                    <textarea
                      id="bio"
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      placeholder="Tell us about yourself..."
                      rows="4"
                      maxLength="1000"
                      className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:focus:ring-neutral-500 text-neutral-900 dark:text-neutral-100 dark:bg-neutral-800"
                    />
                  ) : (
                    <div className="p-4 bg-neutral-800 rounded-lg border border-neutral-700 min-h-[100px] text-left">
                      <p className={`whitespace-pre-wrap ${profileData?.bio ? 'text-neutral-100' : 'text-neutral-500'}`}>{profileData?.bio || 'No bio provided'}</p>
                    </div>
                  )}
                  {isEditing && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {formData.bio.length}/1000 characters
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="space-y-4 pt-6 border-t-2 border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-3 pb-3">
                <div className="p-2 bg-neutral-800 dark:bg-neutral-700 rounded-lg shadow-md">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Account Information
                </h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Member Since:</span>{' '}
                  <span className="text-neutral-900 dark:text-neutral-100 font-medium">
                    {profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Last Updated:</span>{' '}
                  <span className="text-neutral-900 dark:text-neutral-100 font-medium">
                    {profileData?.updatedAt ? new Date(profileData.updatedAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Delete Account Section */}
            <div className="space-y-4 pt-6 border-t-2 border-red-200 dark:border-red-900">
              <div className="flex items-center gap-3 pb-3">
                <div className="p-2 bg-red-600 dark:bg-red-700 rounded-lg shadow-md">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-xl font-bold text-red-600 dark:text-red-400">
                  Danger Zone
                </h4>
              </div>
              
              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border-2 border-red-300 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
                <Button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  Delete Account Permanently
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
          <div className="bg-neutral-900 border-2 border-red-600 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-red-600 p-4 rounded-full">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold text-red-500 mb-4 text-center">
              Delete Account?
            </h3>
            
            <div className="space-y-4 mb-6">
              <p className="text-neutral-200 text-center">
                This action <span className="font-bold text-red-500">cannot be undone</span>. 
                This will permanently delete your account and remove all your data from our servers.
              </p>
              
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-4">
                <p className="text-red-300 text-sm text-left">
                  <strong>Warning:</strong> You will lose access to:
                </p>
                <ul className="list-disc list-inside text-red-300 text-sm mt-2 space-y-1">
                  <li>All your profile information</li>
                  <li>Your account history</li>
                  <li>Any associated data</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await api.delete('/auth/account');

                    // Close modal and clear the session immediately
                    setShowDeleteModal(false);
                    dispatch(logout());
                    
                    // Navigate to login immediately
                    navigate('/login', { 
                      state: { 
                        notification: {
                          type: 'success',
                          title: '✓ Account Deleted',
                          message: 'Your account has been permanently deleted.',
                        }
                      } 
                    });
                  } catch (error) {
                    console.error('Delete account error:', error);
                    setShowDeleteModal(false);
                    
                    // Show error toast notification on same page
                    setToast({
                      type: 'error',
                      title: '✗ Deletion Failed',
                      message: error.response?.data?.message || 'Failed to delete account. Please try again.',
                    });
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}
    </div>
  );
};

export default Profile;
