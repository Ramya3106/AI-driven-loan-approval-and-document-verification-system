import { useState } from 'react';
import {
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
  Alert,
} from 'react-native';

export default function ExistingLoanDetails({ navigation, route }) {
  const [hasExistingLoan, setHasExistingLoan] = useState(null);
  const [loanTypeModal, setLoanTypeModal] = useState(false);
  const [pendingEMIModal, setPendingEMIModal] = useState(false);
  
  const [loanData, setLoanData] = useState({
    loanType: '',
    totalLoanAmount: '',
    monthlyEMI: '',
    remainingTenure: '',
    pendingEMI: '',
  });

  const loanTypes = [
    { label: 'Personal Loan', value: 'personal' },
    { label: 'Education Loan', value: 'education' },
    { label: 'Home Loan', value: 'home' },
    { label: 'Vehicle Loan', value: 'vehicle' },
    { label: 'Business Loan', value: 'business' },
    { label: 'Gold Loan', value: 'gold' },
  ];

  const pendingEMIOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  const getLoanTypeLabel = () => {
    const selected = loanTypes.find(item => item.value === loanData.loanType);
    return selected ? selected.label : 'Select Loan Type';
  };

  const getPendingEMILabel = () => {
    const selected = pendingEMIOptions.find(item => item.value === loanData.pendingEMI);
    return selected ? selected.label : 'Select Option';
  };

  const handleNext = () => {
    // If user has no existing loan, proceed to next page
    if (hasExistingLoan === false) {
      // navigation.navigate('NextPage', { ...route.params });
      Alert.alert('Success', 'Proceeding to next step...');
      return;
    }

    // Validate fields if user has existing loan
    if (!loanData.loanType || !loanData.totalLoanAmount || !loanData.monthlyEMI || 
        !loanData.remainingTenure || !loanData.pendingEMI) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    // Check if user has pending EMI
    if (loanData.pendingEMI === 'yes') {
      Alert.alert(
        '⚠️ Blacklisted',
        'You are marked under blacklist due to pending EMI payments. You cannot proceed with the loan application.',
        [{ text: 'OK', style: 'destructive' }]
      );
      return;
    }

    // Proceed to next page
    // navigation.navigate('NextPage', { ...route.params, loanData });
    Alert.alert('Success', 'Proceeding to next step...');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Your Existing Loans & EMIs</Text>
            <Text style={styles.subtitle}>Please provide details of any existing loans</Text>
          </View>

          <View style={styles.card}>
            {/* Radio Button: Have you already taken any loan? */}
            <View style={styles.fullWidthRow}>
              <Text style={styles.questionLabel}>Have you already taken any loan? *</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setHasExistingLoan(true)}
                >
                  <View style={styles.radioCircle}>
                    {hasExistingLoan === true && <View style={styles.radioSelected} />}
                  </View>
                  <Text style={styles.radioLabel}>Yes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setHasExistingLoan(false)}
                >
                  <View style={styles.radioCircle}>
                    {hasExistingLoan === false && <View style={styles.radioSelected} />}
                  </View>
                  <Text style={styles.radioLabel}>No</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Conditional Fields - Show if user has existing loan */}
            {hasExistingLoan === true && (
              <>
                {/* Loan Type */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Loan Type *</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setLoanTypeModal(true)}
                    >
                      <Text style={[styles.dropdownText, !loanData.loanType && styles.placeholder]}>
                        {getLoanTypeLabel()}
                      </Text>
                      <Text style={styles.dropdownIcon}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Total Loan Amount */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Total Loan Amount (₹) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter total loan amount"
                      keyboardType="numeric"
                      value={loanData.totalLoanAmount}
                      onChangeText={(value) => setLoanData({ ...loanData, totalLoanAmount: value })}
                    />
                  </View>
                </View>

                {/* Monthly EMI */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Monthly EMI (₹) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter monthly EMI amount"
                      keyboardType="numeric"
                      value={loanData.monthlyEMI}
                      onChangeText={(value) => setLoanData({ ...loanData, monthlyEMI: value })}
                    />
                  </View>
                </View>

                {/* Remaining Tenure */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Remaining Tenure (months) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter remaining tenure in months"
                      keyboardType="numeric"
                      value={loanData.remainingTenure}
                      onChangeText={(value) => setLoanData({ ...loanData, remainingTenure: value })}
                    />
                  </View>
                </View>

                {/* Pending EMI */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Pending EMI *</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setPendingEMIModal(true)}
                    >
                      <Text style={[styles.dropdownText, !loanData.pendingEMI && styles.placeholder]}>
                        {getPendingEMILabel()}
                      </Text>
                      <Text style={styles.dropdownIcon}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Blacklist Warning */}
                {loanData.pendingEMI === 'yes' && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <Text style={styles.warningText}>
                      You are marked under blacklist due to pending EMI payments.
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Next Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                hasExistingLoan === null && styles.submitButtonDisabled
              ]}
              onPress={handleNext}
              disabled={hasExistingLoan === null}
            >
              <Text style={styles.submitButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

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
                      setLoanData({ ...loanData, loanType: item.value });
                      setLoanTypeModal(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.label}</Text>
                    {loanData.loanType === item.value && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Pending EMI Modal */}
        <Modal
          visible={pendingEMIModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setPendingEMIModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pending EMI?</Text>
                <TouchableOpacity onPress={() => setPendingEMIModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={pendingEMIOptions}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setLoanData({ ...loanData, pendingEMI: item.value });
                      setPendingEMIModal(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.label}</Text>
                    {loanData.pendingEMI === item.value && (
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
  container: {
    flex: 1,
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
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 24,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 16,
    color: '#374151',
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
  warningBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 24,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '600',
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
    backgroundColor: '#9ca3af',
    shadowOpacity: 0.1,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
});
