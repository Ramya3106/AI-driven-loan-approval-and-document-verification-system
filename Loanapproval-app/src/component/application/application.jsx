import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import Constants from 'expo-constants';

const sanitizeBaseUrl = (value) => (value || '').trim().replace(/\/+$/, '');

const getApiBaseUrl = () => {
  const manualBaseUrl = sanitizeBaseUrl(
    String(
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      Constants.expoConfig?.extra?.apiBaseUrl ||
      Constants.manifest?.extra?.apiBaseUrl ||
      ''
    )
  );

  if (manualBaseUrl) {
    return manualBaseUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoConfig?.extra?.expoClient?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest?.hostUri ||
    '';

  const host = hostUri
    ? hostUri.split(':')[0]
    : Platform.OS === 'android'
      ? '10.0.2.2'
      : 'localhost';

  return sanitizeBaseUrl(`http://${host}:5000`);
};

const requestJson = async (url, options, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Check whether the backend is running.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export default function Application({ navigation, route }) {
  const [formData, setFormData] = useState({
    fullName: '',
    jobType: '',
    annualIncome: '',
    monthlyIncome: '',
    cibilScore: '',
    loanType: '',
    loanAmount: '',
  });

  const [autoCalculate, setAutoCalculate] = useState(true);
  const [jobTypeModal, setJobTypeModal] = useState(false);
  const [loanTypeModal, setLoanTypeModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const loggedInUser = route?.params?.user || null;

  const jobTypes = [
    { label: 'Government', value: 'govt' },
    { label: 'Private', value: 'private' },
    { label: 'Self-Employed', value: 'self-employed' },
    { label: 'Student', value: 'student' },
  ];

  const loanTypes = [
    { label: 'Personal Loan', value: 'personal' },
    { label: 'Education Loan', value: 'education' },
    { label: 'Home Loan', value: 'home' },
    { label: 'Vehicle Loan', value: 'vehicle' },
    { label: 'Business Loan', value: 'business' },
    { label: 'Gold Loan', value: 'gold' },
  ];

  const getJobTypeLabel = () => {
    const selected = jobTypes.find(item => item.value === formData.jobType);
    return selected ? selected.label : 'Select Job Type';
  };

  const getLoanTypeLabel = () => {
    const selected = loanTypes.find(item => item.value === formData.loanType);
    return selected ? selected.label : 'Select Loan Type';
  };

  // Auto-calculate monthly income from annual income
  const handleAnnualIncomeChange = (value) => {
    setFormData({
      ...formData,
      annualIncome: value,
      monthlyIncome: autoCalculate ? (parseFloat(value) / 12).toFixed(2) : formData.monthlyIncome,
    });
  };

  const handleMonthlyIncomeChange = (value) => {
    setFormData({
      ...formData,
      monthlyIncome: value,
    });
    setAutoCalculate(false);
  };

  const handleSubmit = async () => {
    // Validate form
    if (!formData.fullName || !formData.jobType || !formData.annualIncome || 
        !formData.cibilScore || !formData.loanType || !formData.loanAmount) {
      Alert.alert('Missing fields', 'Please fill all required fields.');
      return;
    }

    setSaving(true);
    try {
      const { response, payload } = await requestJson(`${apiBaseUrl}/api/loan-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: loggedInUser?.id || null,
          userEmail: loggedInUser?.email || '',
          fullName: formData.fullName,
          jobType: formData.jobType,
          annualIncome: formData.annualIncome,
          monthlyIncome: formData.monthlyIncome,
          cibilScore: formData.cibilScore,
          loanType: formData.loanType,
          loanAmount: formData.loanAmount,
        }),
      });

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save loan details');
      }

      navigation.navigate('ExistingLoanDetails', {
        formData,
        user: loggedInUser,
        loanDetailId: payload?.id || null,
      });
    } catch (error) {
      Alert.alert('Save failed', error?.message || 'Unable to save loan details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={styles.screen}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
        >
          <View style={styles.header}>
            <Text style={styles.title}>Enter Your Loan Details</Text>
            <Text style={styles.subtitle}>Please provide accurate information for faster approval</Text>
          </View>

          <View style={styles.card}>
            {/* Row 1: Full Name */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChangeText={(value) => setFormData({ ...formData, fullName: value })}
                />
              </View>
            </View>

            {/* Job Type */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Job Type *</Text>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => setJobTypeModal(true)}
                >
                  <Text style={[styles.dropdownText, !formData.jobType && styles.placeholder]}>
                    {getJobTypeLabel()}
                  </Text>
                  <Text style={styles.dropdownIcon}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Annual Income */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Annual Income (₹) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter annual income"
                  keyboardType="numeric"
                  value={formData.annualIncome}
                  onChangeText={handleAnnualIncomeChange}
                />
              </View>
            </View>

            {/* Monthly Income */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Monthly Income (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Auto-calculated or enter manually"
                  keyboardType="numeric"
                  value={formData.monthlyIncome}
                  onChangeText={handleMonthlyIncomeChange}
                />
                {autoCalculate && formData.monthlyIncome && (
                  <Text style={styles.helperText}>Auto-calculated</Text>
                )}
              </View>
            </View>

            {/* CIBIL Score */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>CIBIL Score *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter CIBIL score (300-900)"
                  keyboardType="numeric"
                  value={formData.cibilScore}
                  onChangeText={(value) => setFormData({ ...formData, cibilScore: value })}
                  maxLength={3}
                />
              </View>
            </View>

            {/* Loan Type */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Loan Type *</Text>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => setLoanTypeModal(true)}
                >
                  <Text style={[styles.dropdownText, !formData.loanType && styles.placeholder]}>
                    {getLoanTypeLabel()}
                  </Text>
                  <Text style={styles.dropdownIcon}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Required Loan Amount */}
            <View style={styles.fullWidthRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Required Loan Amount (₹) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter loan amount"
                  keyboardType="numeric"
                  value={formData.loanAmount}
                  onChangeText={(value) => setFormData({ ...formData, loanAmount: value })}
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, saving && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.submitButtonText}>Next →</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Job Type Modal */}
        <Modal
          visible={jobTypeModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setJobTypeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Job Type</Text>
                <TouchableOpacity onPress={() => setJobTypeModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={jobTypes}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setFormData({ ...formData, jobType: item.value });
                      setJobTypeModal(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.label}</Text>
                    {formData.jobType === item.value && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Loan Type Modal */}
        <Modal
          visible={loanTypeModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setLoanTypeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Loan Type</Text>
                <TouchableOpacity onPress={() => setLoanTypeModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={loanTypes}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setFormData({ ...formData, loanType: item.value });
                      setLoanTypeModal(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.label}</Text>
                    {formData.loanType === item.value && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
  },
  header: {
    padding: 24,
    paddingTop: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    margin: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  fullWidthRow: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 16,
  },
  fieldGroup: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
    color: '#1f2937',
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  dropdownText: {
    fontSize: 15,
    color: '#1f2937',
    flex: 1,
  },
  placeholder: {
    color: '#9ca3af',
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalClose: {
    fontSize: 24,
    color: '#6b7280',
    fontWeight: '300',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalItemText: {
    fontSize: 16,
    color: '#374151',
  },
  checkmark: {
    fontSize: 20,
    color: '#3b82f6',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 4,
    fontStyle: 'italic',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.75,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});