import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

// Safely import OCR module only if not in Expo Go
const getOcrModule = () => {
  // Skip OCR in Expo Go completely
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  
  try {
    const ocrModule = require('expo-mlkit-ocr');
    return ocrModule?.default || ocrModule;
  } catch (error) {
    console.log('OCR module not available:', error.message);
    return null;
  }
};

const getApiBaseUrl = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.hostUri ||
    '';

  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:5000`;
};

const runOcrViaApi = async (base64Image) => {
  if (!base64Image) {
    throw new Error('Missing base64 image data');
  }

  const response = await fetch(`${getApiBaseUrl()}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Image }),
  });

  if (!response.ok) {
    let errorMessage = 'OCR API request failed';
    try {
      const errorBody = await response.json();
      if (errorBody?.error) {
        errorMessage = errorBody.error;
      }
    } catch (error) {
      // Ignore JSON parsing errors from non-JSON responses.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data?.text) {
    throw new Error(data?.error || 'OCR API returned empty text');
  }

  return data.text;
};

export default function ExistingLoanDetails({ navigation, route }) {
  const [hasExistingLoan, setHasExistingLoan] = useState(null);
  const [loanTypeModal, setLoanTypeModal] = useState(false);
  const [pendingEMIModal, setPendingEMIModal] = useState(false);
  const [bills, setBills] = useState([]);
  const [uploadedDocument, setUploadedDocument] = useState('');
  const [documentPickerModal, setDocumentPickerModal] = useState(false);
  const [uploadedDocumentBase64, setUploadedDocumentBase64] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [lastVerifiedSnapshot, setLastVerifiedSnapshot] = useState(null);
  
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
    { label: 'Mobile Loan', value: 'mobile' },
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

  const applicantName = useMemo(() => {
    return (
      route?.params?.formData?.fullName ||
      route?.params?.formData?.FullName ||
      ''
    );
  }, [route?.params?.formData]);

  const normalizeText = useCallback((value) => {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }, []);

  const verifyDocument = useCallback(
    async ({ showAlerts = true, documentUri, documentBase64, amountValue } = {}) => {
      const activeDocument = documentUri || uploadedDocument;
      const activeBase64 = documentBase64 || uploadedDocumentBase64;
      const activeAmount = amountValue ?? loanData.totalLoanAmount;

      if (!activeDocument || !activeBase64) {
        setVerificationStatus('failed');
        setVerificationMessage('Please upload a clear loan document.');
        return false;
      }

      if (!applicantName) {
        setVerificationStatus('failed');
        setVerificationMessage('Applicant name is missing. Please go back and fill it.');
        return false;
      }

      if (!activeAmount) {
        setVerificationStatus('failed');
        setVerificationMessage('Please enter the total loan amount before verification.');
        return false;
      }

      const normalizedName = normalizeText(applicantName);
      const normalizedAmount = activeAmount.replace(/[^0-9]/g, '');

      const snapshot = `${activeDocument}|${normalizedName}|${normalizedAmount}`;
      if (lastVerifiedSnapshot === snapshot && verificationStatus === 'success') {
        return true;
      }

      setVerificationStatus('verifying');
      setVerificationMessage('Verifying document...');

      const ocrModule = getOcrModule();
      let extractedText = '';

      try {
        if (ocrModule?.recognizeText) {
          const ocrResult = await ocrModule.recognizeText(activeDocument);
          extractedText = ocrResult?.text || '';
        } else {
          extractedText = await runOcrViaApi(activeBase64);
        }
      } catch (error) {
        console.error('OCR Error:', error);
        setVerificationStatus('failed');
        setVerificationMessage(
          error?.message || 'Could not process the document. Please try again.'
        );
        if (showAlerts) {
          Alert.alert(
            'Verification Error',
            error?.message ||
              'Could not process the document. Please ensure the image is clear and try again.',
            [{ text: 'OK', style: 'destructive' }]
          );
        }
        return false;
      }

      const ocrText = normalizeText(extractedText);

      const nameTokens = applicantName
        .split(/\s+/)
        .map((token) => normalizeText(token))
        .filter((token) => token.length > 1);

      const nameMatch =
        (normalizedName && ocrText.includes(normalizedName)) ||
        (nameTokens.length > 0 && nameTokens.every((token) => ocrText.includes(token)));

      const amountMatch = normalizedAmount && ocrText.includes(normalizedAmount);

      if (!nameMatch || !amountMatch) {
        setVerificationStatus('failed');
        setVerificationMessage('Document verification failed. Name or amount not matched.');
        if (showAlerts) {
          Alert.alert(
            'Document Verification Failed',
            'Name or amount not matched. Please upload a valid loan document.',
            [{ text: 'OK', style: 'destructive' }]
          );
        }
        return false;
      }

      setVerificationStatus('success');
      setVerificationMessage('Document verified successfully.');
      setLastVerifiedSnapshot(snapshot);
      if (showAlerts) {
        Alert.alert('Verification Success', 'Name and amount matched.', [{ text: 'OK' }]);
      }
      return true;
    },
    [
      applicantName,
      lastVerifiedSnapshot,
      loanData.totalLoanAmount,
      normalizeText,
      loanData.totalLoanAmount,
      uploadedDocument,
      uploadedDocumentBase64,
      verificationStatus,
    ]
  );

  const handleNext = async () => {
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

    if (bills.length === 0 || bills.some((bill) => !bill.name || !bill.amount)) {
      Alert.alert('Error', 'Please add at least one bill with name and amount');
      return;
    }

    if (!applicantName) {
      Alert.alert('Error', 'Applicant name is missing. Please go back and fill it.');
      return;
    }

    if (!uploadedDocument) {
      Alert.alert('Error', 'Please upload a valid document.');
      return;
    }

    const isVerified = await verifyDocument({ showAlerts: true });
    if (!isVerified) {
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

  const handleAddBill = () => {
    setBills((prevBills) => [
      ...prevBills,
      { id: `${Date.now()}`, name: '', amount: '' },
    ]);
  };

  const handleRemoveBill = (billId) => {
    setBills((prevBills) => prevBills.filter((bill) => bill.id !== billId));
  };

  const handleUpdateBill = (billId, field, value) => {
    setBills((prevBills) =>
      prevBills.map((bill) =>
        bill.id === billId ? { ...bill, [field]: value } : bill
      )
    );
  };

  const handleUploadDocument = () => {
    setDocumentPickerModal(true);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  };

  const requestGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const handlePickFromCamera = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Camera permission is needed to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      const pickedUri = result.assets[0].uri;
      const pickedBase64 = result.assets[0].base64 || '';
      setUploadedDocument(pickedUri);
      setUploadedDocumentBase64(pickedBase64);
      setDocumentPickerModal(false);
      await verifyDocument({
        showAlerts: true,
        documentUri: pickedUri,
        documentBase64: pickedBase64,
        amountValue: loanData.totalLoanAmount,
      });
    }
  };

  const handlePickFromGallery = async () => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Gallery permission is needed to select a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      selectionLimit: 1,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      const pickedUri = result.assets[0].uri;
      const pickedBase64 = result.assets[0].base64 || '';
      setUploadedDocument(pickedUri);
      setUploadedDocumentBase64(pickedBase64);
      setDocumentPickerModal(false);
      await verifyDocument({
        showAlerts: true,
        documentUri: pickedUri,
        documentBase64: pickedBase64,
        amountValue: loanData.totalLoanAmount,
      });
    }
  };

  useEffect(() => {
    if (!uploadedDocument || !uploadedDocumentBase64) {
      return;
    }

    if (!loanData.totalLoanAmount) {
      return;
    }

    const debounceId = setTimeout(() => {
      verifyDocument({ showAlerts: false });
    }, 500);

    return () => clearTimeout(debounceId);
  }, [
    loanData.totalLoanAmount,
    uploadedDocument,
    uploadedDocumentBase64,
    verifyDocument,
  ]);

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

                {/* Document Upload */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Upload Loan Document</Text>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleUploadDocument}
                    >
                      <Text style={styles.uploadButtonText}>Upload Document</Text>
                    </TouchableOpacity>
                    <Text style={styles.uploadHint}>
                      {uploadedDocument ? 'Attached: 1 photo selected' : 'No document uploaded'}
                    </Text>
                    {verificationStatus !== 'idle' && (
                      <Text
                        style={[
                          styles.verificationStatusText,
                          verificationStatus === 'success' && styles.verificationStatusSuccess,
                          verificationStatus === 'failed' && styles.verificationStatusFailed,
                        ]}
                      >
                        {verificationMessage}
                      </Text>
                    )}
                    {uploadedDocument ? (
                      <Image
                        source={{ uri: uploadedDocument }}
                        style={styles.documentPreview}
                      />
                    ) : null}
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

                {/* Add Bill */}
                <View style={styles.fullWidthRow}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Add Bill</Text>
                    <TouchableOpacity style={styles.addBillButton} onPress={handleAddBill}>
                      <Text style={styles.addBillButtonText}>Add Bill</Text>
                    </TouchableOpacity>

                    {bills.length === 0 ? (
                      <Text style={styles.emptyBillsText}>No bills added yet.</Text>
                    ) : (
                      <View style={styles.billsList}>
                        {bills.map((bill, index) => (
                          <View key={bill.id} style={styles.billItem}>
                            <Text style={styles.billIndex}>Bill {index + 1}</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="Bill name"
                              value={bill.name}
                              onChangeText={(value) => handleUpdateBill(bill.id, 'name', value)}
                            />
                            <TextInput
                              style={[styles.input, styles.inputSpacing]}
                              placeholder="Bill amount"
                              keyboardType="numeric"
                              value={bill.amount}
                              onChangeText={(value) => handleUpdateBill(bill.id, 'amount', value)}
                            />
                            <TouchableOpacity
                              style={styles.billRemoveButton}
                              onPress={() => handleRemoveBill(bill.id)}
                            >
                              <Text style={styles.billRemoveText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
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

        {/* Document Picker Modal */}
        <Modal
          visible={documentPickerModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setDocumentPickerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Upload Document</Text>
                <TouchableOpacity onPress={() => setDocumentPickerModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.modalActionButton}
                onPress={handlePickFromCamera}
              >
                <Text style={styles.modalActionText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalActionButton}
                onPress={handlePickFromGallery}
              >
                <Text style={styles.modalActionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setDocumentPickerModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
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
  inputSpacing: {
    marginTop: 12,
  },
  emptyBillsText: {
    marginTop: 10,
    fontSize: 13,
    color: '#6b7280',
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  uploadHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  verificationStatusText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  verificationStatusSuccess: {
    color: '#15803d',
  },
  verificationStatusFailed: {
    color: '#b91c1c',
  },
  documentPreview: {
    marginTop: 12,
    width: '100%',
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addBillButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    billIndex: {
      fontSize: 13,
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: 8,
    },
    padding: 12,
    backgroundColor: '#f9fafb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
      alignSelf: 'flex-start',
      marginTop: 10,
  },
  billInfo: {
    flex: 1,
    marginRight: 12,
  },
  billName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  billAmount: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  billRemoveButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  billRemoveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
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
  modalActionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalActionText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  modalCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
});
