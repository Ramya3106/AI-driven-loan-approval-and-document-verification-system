import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

const OCR_TIMEOUT_MS = 45000;
const LOCAL_OCR_TIMEOUT_MS = 15000;
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const sanitizeBaseUrl = (value) => (value || '').trim().replace(/\/+$/, '');

const getApiBaseUrl = () => {
  const manualBaseUrl = sanitizeBaseUrl(
    String(Constants.expoConfig?.extra?.apiBaseUrl || Constants.manifest?.extra?.apiBaseUrl || '')
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

const withTimeout = async (url, options, timeoutMs, fallbackMessage) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(fallbackMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const requestJson = async (url, options, timeoutMs = 12000) => {
  const response = await withTimeout(
    url,
    options,
    timeoutMs,
    'Request timed out. Check if backend server is reachable.'
  );
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const withPromiseTimeout = async (workPromise, timeoutMs, fallbackMessage) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(fallbackMessage)), timeoutMs);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

const loadOptionalLocalOcrModule = async () => {
  if (IS_EXPO_GO) {
    return null;
  }

  try {
    const moduleRef = await import('expo-mlkit-ocr');
    return moduleRef?.default || moduleRef;
  } catch (error) {
    return null;
  }
};

const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const runOcrViaApi = async (base64Image) => {
  const response = await withTimeout(
    `${getApiBaseUrl()}/ocr`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image }),
    },
    OCR_TIMEOUT_MS,
    'OCR timed out after 45 seconds. Please retry with a clearer image.'
  );

  if (!response.ok) {
    let errorMessage = 'OCR request failed';
    try {
      const body = await response.json();
      if (body?.error) {
        errorMessage = body.error;
      }
    } catch (error) {
      // Keep fallback message.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data?.text || '';
};

const runLocalOcr = async (imageUri) => {
  const localOcrModule = await loadOptionalLocalOcrModule();
  if (!localOcrModule?.recognizeText) {
    throw new Error('Local OCR module unavailable.');
  }

  const result = await withPromiseTimeout(
    localOcrModule.recognizeText(imageUri),
    LOCAL_OCR_TIMEOUT_MS,
    'Local OCR timed out.'
  );
  return result?.text || '';
};

const runBestEffortOcr = async ({ imageUri, base64Image }) => {
  try {
    const localText = await runLocalOcr(imageUri);
    if (localText && localText.trim().length >= 20) {
      return localText.trim();
    }
  } catch (error) {
    // Fall back to server OCR when local OCR fails on current runtime/device.
  }

  if (!base64Image) {
    throw new Error('Unable to extract text from image. Please retry with a clearer image.');
  }

  return runOcrViaApi(base64Image);
};

export default function ExistingLoanDetails({ navigation, route }) {
  const [hasExistingLoan, setHasExistingLoan] = useState(null);
  const [loanData, setLoanData] = useState({
    loanType: '',
    totalLoanAmount: '',
    monthlyEMI: '',
    remainingTenure: '',
    pendingEMI: '',
  });
  const [uploadedDocument, setUploadedDocument] = useState('');
  const [uploadedDocumentBase64, setUploadedDocumentBase64] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const applicantName = useMemo(() => {
    const formData = route?.params?.formData || {};
    return formData.fullName || formData.FullName || '';
  }, [route?.params?.formData]);

  const verifyExistingLoanDocument = async () => {
    if (!uploadedDocumentBase64) {
      setVerificationStatus('failed');
      setVerificationMessage('Please upload a valid loan document.');
      return false;
    }

    if (!loanData.totalLoanAmount) {
      setVerificationStatus('failed');
      setVerificationMessage('Enter total loan amount before verification.');
      return false;
    }

    if (!applicantName) {
      setVerificationStatus('failed');
      setVerificationMessage('Applicant name is missing in previous step.');
      return false;
    }

    setVerificationStatus('verifying');
    setVerificationMessage('Verifying document...');

    try {
      const extractedText = await runBestEffortOcr({
        imageUri: uploadedDocument,
        base64Image: uploadedDocumentBase64,
      });

      const normalizedText = normalizeText(extractedText);
      const normalizedName = normalizeText(applicantName);
      const normalizedAmount = loanData.totalLoanAmount.replace(/[^0-9]/g, '');

      // Build name tokens and check token coverage (tolerant matching)
      const nameTokens = applicantName
        .split(/\s+/)
        .map((token) => normalizeText(token))
        .filter((token) => token.length > 1);

      let nameMatch = false;
      if (normalizedName && normalizedText.includes(normalizedName)) {
        nameMatch = true;
      } else if (nameTokens.length > 0) {
        const matched = nameTokens.filter((token) => normalizedText.includes(token)).length;
        const coverage = matched / nameTokens.length;
        if (coverage >= 0.66) {
          nameMatch = true;
        }
      }

      // Extract numeric candidates from OCR text and compare with tolerance
      const digitsText = (extractedText || '').replace(/[,\s]/g, '');
      const numericCandidates = (digitsText.match(/\d{3,}/g) || []).map((s) => s.replace(/[^0-9]/g, ''));

      const amountNum = Number(normalizedAmount || 0);
      let amountMatch = false;
      if (amountNum > 0) {
        for (const candidate of numericCandidates) {
          const candNum = Number(candidate || 0);
          if (!candNum) continue;
          if (candNum === amountNum) {
            amountMatch = true;
            break;
          }

          // Allow small relative differences (e.g., OCR dropped/added a zero) or scale differences
          const diff = Math.abs(candNum - amountNum);
          const rel = diff / Math.max(amountNum, 1);
          if (rel <= 0.05 || candNum === amountNum * 10 || amountNum === candNum * 10) {
            amountMatch = true;
            break;
          }
        }
      }

      if (!nameMatch || !amountMatch) {
        setVerificationStatus('failed');
        setVerificationMessage('Verification failed: name or amount mismatch.');
        return false;
      }

      setVerificationStatus('success');
      setVerificationMessage('Document verified successfully.');
      return true;
    } catch (error) {
      setVerificationStatus('failed');
      setVerificationMessage(error?.message || 'Unable to verify document.');
      return false;
    }
  };

  const handlePickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Gallery access is required to upload document.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      selectionLimit: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selected = result.assets[0];
    setUploadedDocument(selected.uri);
    setUploadedDocumentBase64(selected.base64 || '');
    setVerificationStatus('idle');
    setVerificationMessage('');
  };

  const handleNext = async () => {
    if (hasExistingLoan === null) {
      Alert.alert('Required', 'Please select Yes or No.');
      return;
    }

    const user = route?.params?.user || null;
    const loanDetailId = route?.params?.loanDetailId || null;

    if (hasExistingLoan) {
      if (
        !loanData.loanType ||
        !loanData.totalLoanAmount ||
        !loanData.monthlyEMI ||
        !loanData.remainingTenure ||
        !loanData.pendingEMI
      ) {
        Alert.alert('Missing fields', 'Please fill all existing-loan fields.');
        return;
      }

      const verified = await verifyExistingLoanDocument();
      if (!verified) {
        Alert.alert('Verification failed', 'Document verification did not pass.');
        return;
      }

      if (loanData.pendingEMI === 'yes') {
        Alert.alert(
          'Blacklisted',
          'You are marked under blacklist due to pending EMI payments and cannot proceed.'
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payloadToSave = {
        userId: user?.id || null,
        userEmail: user?.email || '',
        loanDetailId,
        hasExistingLoan,
        loanType: hasExistingLoan ? loanData.loanType : '',
        totalLoanAmount: hasExistingLoan ? loanData.totalLoanAmount : 0,
        monthlyEMI: hasExistingLoan ? loanData.monthlyEMI : 0,
        remainingTenure: hasExistingLoan ? loanData.remainingTenure : 0,
        pendingEMI: hasExistingLoan ? loanData.pendingEMI : 'no',
        verificationStatus: hasExistingLoan ? verificationStatus : 'not_required',
        verificationMessage: hasExistingLoan ? verificationMessage : '',
      };

      const { response, payload } = await requestJson(`${getApiBaseUrl()}/api/existing-loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSave),
      });

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save existing loan details');
      }

      navigation.navigate('DocumentUploadPage', {
        ...route?.params,
        hasExistingLoan,
        existingLoanData: hasExistingLoan ? loanData : {},
        existingLoanId: payload?.id || null,
      });
    } catch (error) {
      Alert.alert('Save failed', error?.message || 'Unable to save existing loan details');
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
          <Text style={styles.title}>Your Existing Loans & EMIs</Text>
          <Text style={styles.subtitle}>Please provide details of any existing loans</Text>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Have you already taken any loan? *</Text>
            <View style={styles.radioRow}>
              <TouchableOpacity style={styles.radioOption} onPress={() => setHasExistingLoan(true)}>
                <View style={styles.radioCircle}>
                  {hasExistingLoan === true ? <View style={styles.radioSelected} /> : null}
                </View>
                <Text style={styles.radioText}>Yes</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.radioOption} onPress={() => setHasExistingLoan(false)}>
                <View style={styles.radioCircle}>
                  {hasExistingLoan === false ? <View style={styles.radioSelected} /> : null}
                </View>
                <Text style={styles.radioText}>No</Text>
              </TouchableOpacity>
            </View>

            {hasExistingLoan === true ? (
              <>
                <Text style={styles.inputLabel}>Loan Type *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter loan type"
                  value={loanData.loanType}
                  onChangeText={(value) => setLoanData({ ...loanData, loanType: value })}
                />

                <Text style={styles.inputLabel}>Total Loan Amount (Rs) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter total loan amount"
                  value={loanData.totalLoanAmount}
                  keyboardType="numeric"
                  onChangeText={(value) => setLoanData({ ...loanData, totalLoanAmount: value })}
                />

                <Text style={styles.inputLabel}>Monthly EMI (Rs) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter monthly EMI"
                  value={loanData.monthlyEMI}
                  keyboardType="numeric"
                  onChangeText={(value) => setLoanData({ ...loanData, monthlyEMI: value })}
                />

                <Text style={styles.inputLabel}>Remaining Tenure (Months) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter remaining tenure"
                  value={loanData.remainingTenure}
                  keyboardType="numeric"
                  onChangeText={(value) => setLoanData({ ...loanData, remainingTenure: value })}
                />

                <Text style={styles.inputLabel}>Pending EMI (yes / no) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="yes or no"
                  value={loanData.pendingEMI}
                  autoCapitalize="none"
                  onChangeText={(value) => setLoanData({ ...loanData, pendingEMI: value.toLowerCase() })}
                />

                <Text style={styles.inputLabel}>Upload Loan Document</Text>
                <TouchableOpacity style={styles.uploadButton} onPress={handlePickFromGallery}>
                  <Text style={styles.uploadButtonText}>Upload Document</Text>
                </TouchableOpacity>

                {uploadedDocument ? <Image source={{ uri: uploadedDocument }} style={styles.preview} /> : null}

                {verificationStatus !== 'idle' ? (
                  <Text
                    style={[
                      styles.verificationText,
                      verificationStatus === 'success' && styles.verificationSuccess,
                      verificationStatus === 'failed' && styles.verificationFailed,
                    ]}
                  >
                    {verificationMessage}
                  </Text>
                ) : null}
              </>
            ) : null}

            <TouchableOpacity
              style={[
                styles.nextButton,
                hasExistingLoan === null && styles.nextButtonDisabled,
                saving && styles.nextButtonDisabled,
              ]}
              onPress={handleNext}
              disabled={hasExistingLoan === null || saving}
            >
              <Text style={styles.nextButtonText}>{saving ? 'Saving...' : 'Next -&gt;'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 14,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  radioRow: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 14,
    marginBottom: 14,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  radioText: {
    fontSize: 18,
    color: '#1e293b',
  },
  inputLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  uploadButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  uploadButtonText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
  },
  preview: {
    marginTop: 10,
    width: '100%',
    height: 160,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  verificationText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  verificationSuccess: {
    color: '#15803d',
  },
  verificationFailed: {
    color: '#b91c1c',
  },
  nextButton: {
    marginTop: 20,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  nextButtonDisabled: {
    opacity: 0.55,
  },
  nextButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
