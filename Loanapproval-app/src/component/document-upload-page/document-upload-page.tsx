// @ts-nocheck
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

const DOCUMENT_TYPES = [
  { key: 'aadhaarCard', label: 'Aadhaar Card' },
  { key: 'panCard', label: 'PAN Card' },
  { key: 'salarySlip', label: 'Salary Slip' },
  { key: 'bankStatement', label: 'Bank Statement' },
  { key: 'idProof', label: 'ID Proof' },
  { key: 'addressProof', label: 'Address Proof' },
];

const OCR_TIMEOUT_MS = 45000;
const VALIDATION_TIMEOUT_MS = 10000;
const LOCAL_OCR_TIMEOUT_MS = 15000;
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const sanitizeBaseUrl = (value: string) => (value || '').trim().replace(/\/+$/, '');

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

const withTimeout = async (url: string, options: any, timeoutMs: number, fallbackMessage: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(fallbackMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const withPromiseTimeout = async <T,>(workPromise: Promise<T>, timeoutMs: number, fallbackMessage: string) => {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
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
    const moduleRef: any = await import('expo-mlkit-ocr');
    return moduleRef?.default || moduleRef;
  } catch (error) {
    return null;
  }
};

const requestGalleryPermission = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
};

const normalizeText = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const runOcrViaApi = async (base64Image: string) => {
  const response = await withTimeout(
    `${getApiBaseUrl()}/ocr`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      // Keep fallback error message.
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data?.text || '';
};

const runLocalOcr = async (imageUri: string) => {
  const localOcrModule = await loadOptionalLocalOcrModule();
  if (!localOcrModule?.recognizeText) {
    throw new Error('Local OCR module unavailable.');
  }

  const result: any = await withPromiseTimeout(
    localOcrModule.recognizeText(imageUri),
    LOCAL_OCR_TIMEOUT_MS,
    'Local OCR timed out.'
  );
  return result?.text || '';
};

const runBestEffortOcr = async ({ imageUri, base64Image }: { imageUri: string; base64Image: string }) => {
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

const runAiValidation = async ({ documentType, extractedText, userDetails }: any) => {
  const response = await withTimeout(
    `${getApiBaseUrl()}/validate-document`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentType, extractedText, userDetails }),
    },
    VALIDATION_TIMEOUT_MS,
    'Validation timed out. Please retry.'
  );

  if (!response.ok) {
    let errorMessage = 'Validation request failed';
    try {
      const body = await response.json();
      if (body?.error) {
        errorMessage = body.error;
      }
    } catch (error) {
      // Keep fallback error message.
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

export default function DocumentUploadPage({ navigation, route }: any) {
  const [documents, setDocuments] = useState(() => {
    const initialState: any = {};
    DOCUMENT_TYPES.forEach((doc) => {
      initialState[doc.key] = {
        uri: '',
        base64: '',
        status: 'idle',
        statusText: '',
        progress: 0,
        extractedText: '',
      };
    });
    return initialState;
  });

  const userDetails = useMemo(() => {
    const formData = route?.params?.formData || {};
    return {
      name: formData.fullName || formData.FullName || '',
      income: formData.monthlyIncome || formData.annualIncome || '',
      monthlyIncome: formData.monthlyIncome || '',
      annualIncome: formData.annualIncome || '',
      cibilScore: formData.cibilScore || '',
      loanAmount: formData.loanAmount || '',
      hasExistingLoan: route?.params?.hasExistingLoan,
    };
  }, [route?.params]);

  const updateDocument = (key: string, patch: any) => {
    setDocuments((prev: any) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }));
  };

  const simulateProgress = (key: string) => {
    updateDocument(key, { progress: 0, status: 'uploading', statusText: 'Uploading document...' });
    const marks = [20, 45, 70, 90];

    marks.forEach((value, index) => {
      setTimeout(() => {
        updateDocument(key, { progress: value });
      }, (index + 1) * 220);
    });
  };

  const pickImageAndValidate = async (key: string, label: string) => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      Alert.alert('Permission required', 'Gallery permission is needed to select a document.');
      return;
    }

    simulateProgress(key);

    const imageResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      selectionLimit: 1,
    });

    if (imageResult.canceled || !imageResult.assets?.length) {
      updateDocument(key, {
        status: 'idle',
        statusText: 'Upload cancelled.',
        progress: 0,
      });
      return;
    }

    const selected = imageResult.assets[0];
    const selectedBase64 = selected.base64 || '';

    updateDocument(key, {
      uri: selected.uri,
      base64: selectedBase64,
      progress: 100,
      status: 'validating',
      statusText: 'Running OCR and AI checks...',
    });

    try {
      if (!selectedBase64) {
        throw new Error('No base64 data found. Please pick a clearer image.');
      }

      const extractedText = await runBestEffortOcr({
        imageUri: selected.uri,
        base64Image: selectedBase64,
      });
      const aiResult = await runAiValidation({
        documentType: label,
        extractedText,
        userDetails,
      });

      const statusText = normalizeText(aiResult?.status);
      const isNameMatched = aiResult?.checks?.name !== false;
      const isOriginal = statusText === 'original' && isNameMatched;

      const failureMessage = !isNameMatched
        ? 'Name mismatch with provided application details.'
        : aiResult?.message || 'Tampered Document';

      updateDocument(key, {
        extractedText,
        status: isOriginal ? 'verified' : 'tampered',
        statusText: isOriginal ? 'Original' : failureMessage,
        progress: 100,
      });
    } catch (error: any) {
      updateDocument(key, {
        status: 'tampered',
        statusText: error?.message || 'Tampered Document',
        progress: 100,
      });
    }
  };

  const completion = useMemo(() => {
    const list = DOCUMENT_TYPES.map((doc) => documents[doc.key]);
    const uploaded = list.filter((doc) => !!doc?.uri).length;
    return Math.round((uploaded / DOCUMENT_TYPES.length) * 100);
  }, [documents]);

  const verifiedCount = useMemo(() => {
    return DOCUMENT_TYPES.map((doc) => documents[doc.key]).filter(
      (doc) => doc?.status === 'verified'
    ).length;
  }, [documents]);

  const handleNext = () => {
    if (verifiedCount === 0) {
      Alert.alert('Upload pending', 'Please upload and verify at least one document.');
      return;
    }

    Alert.alert('AI Approval Prediction', 'Proceeding to AI approval prediction step.');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Upload Required Documents</Text>
        <Text style={styles.subtitle}>Accepted formats: Image / PDF (AI OCR uses image uploads)</Text>

        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>Upload Progress: {completion}%</Text>
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressBarFill, { width: `${completion}%` }]} />
          </View>
          <Text style={styles.progressHint}>Verified documents: {verifiedCount}/{DOCUMENT_TYPES.length}</Text>
        </View>

        {DOCUMENT_TYPES.map((doc) => {
          const state = documents[doc.key] || {};
          return (
            <View key={doc.key} style={styles.docRow}>
              <View style={styles.docTopRow}>
                <Text style={styles.docTitle}>{doc.label}</Text>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={() => pickImageAndValidate(doc.key, doc.label)}
                >
                  <Text style={styles.uploadButtonText}>Upload (Image/PDF)</Text>
                </TouchableOpacity>
              </View>

              {state.uri ? <Image source={{ uri: state.uri }} style={styles.previewImage} /> : null}

              {state.status === 'uploading' || state.status === 'validating' ? (
                <View style={styles.miniProgressWrap}>
                  <View style={[styles.miniProgressFill, { width: `${state.progress || 0}%` }]} />
                </View>
              ) : null}

              {!!state.statusText ? (
                <View style={styles.statusRow}>
                  <Text
                    style={[
                      styles.statusIcon,
                      state.status === 'verified' && styles.verifiedIcon,
                      state.status === 'tampered' && styles.tamperedIcon,
                    ]}
                  >
                    {state.status === 'verified' ? '✓' : state.status === 'tampered' ? '✕' : '•'}
                  </Text>
                  <Text
                    style={[
                      styles.statusText,
                      state.status === 'verified' && styles.verifiedText,
                      state.status === 'tampered' && styles.tamperedText,
                    ]}
                  >
                    {state.statusText}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next to AI Approval Prediction</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  container: {
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: Platform.OS === 'android' ? 6 : 0,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#475569',
  },
  progressCard: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe1eb',
  },
  progressLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  progressBarWrap: {
    marginTop: 10,
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  progressHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#475569',
  },
  docRow: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe1eb',
    padding: 12,
  },
  docTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  docTitle: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#e2ecff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  uploadButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
  },
  previewImage: {
    marginTop: 10,
    width: '100%',
    height: 140,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  miniProgressWrap: {
    marginTop: 10,
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  statusRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIcon: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '700',
  },
  verifiedIcon: {
    color: '#15803d',
  },
  tamperedIcon: {
    color: '#b91c1c',
  },
  statusText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  verifiedText: {
    color: '#15803d',
    fontWeight: '600',
  },
  tamperedText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  nextButton: {
    marginTop: 20,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
