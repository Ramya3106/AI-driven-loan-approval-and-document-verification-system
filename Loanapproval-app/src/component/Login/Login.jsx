import { useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';

const sanitizeBaseUrl = (value) => (value || '').trim().replace(/\/+$/, '');

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
      throw new Error('Request timed out. Check that the backend server is running and reachable from your phone.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

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

export default function Login({ navigation }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupOtp, setSignupOtp] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const handleSendOtp = async () => {
    const name = signupName.trim();
    const email = signupEmail.trim().toLowerCase();

    if (!name || !email) {
      Alert.alert('Missing details', 'Please enter your full name and email to receive OTP.');
      return;
    }

    setOtpSending(true);
    try {
      const { response, payload } = await requestJson(`${apiBaseUrl}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send OTP');
      }

      Alert.alert('OTP sent', 'Check your email for the OTP and enter it here.');
    } catch (error) {
      Alert.alert('OTP error', error?.message || 'Unable to send OTP');
    } finally {
      setOtpSending(false);
    }
  };

  const handleRegister = async () => {
    const name = signupName.trim();
    const email = signupEmail.trim().toLowerCase();

    if (!name || !email || !signupOtp || !signupPassword || !confirmPassword) {
      Alert.alert('Missing fields', 'Please enter all registration details.');
      return;
    }

    if (signupPassword !== confirmPassword) {
      Alert.alert('Password mismatch', 'Password and confirm password must match.');
      return;
    }

    setRegistering(true);
    try {
      const { response, payload } = await requestJson(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          otp: signupOtp.trim(),
          password: signupPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to register');
      }

      Alert.alert('Success', 'Registration completed. Please login.');
      setIsLogin(true);
      setLoginEmail(email);
      setLoginPassword('');
      setSignupOtp('');
      setSignupPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Registration error', error?.message || 'Unable to register user');
    } finally {
      setRegistering(false);
    }
  };

  const handleLogin = async () => {
    const email = loginEmail.trim().toLowerCase();
    if (!email || !loginPassword) {
      Alert.alert('Missing details', 'Please enter your email and password.');
      return;
    }

    setLoggingIn(true);
    try {
      const { response, payload } = await requestJson(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: loginPassword }),
      });

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to login');
      }

      navigation.navigate('Application');
    } catch (error) {
      Alert.alert('Login error', error?.message || 'Unable to login');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI-Powered Loan System</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Login to continue' : 'Create your account'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segmentButton, isLogin && styles.segmentActive]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.segmentText, isLogin && styles.segmentTextActive]}>
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, !isLogin && styles.segmentActive]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.segmentText, !isLogin && styles.segmentTextActive]}>
                Signup
              </Text>
            </TouchableOpacity>
          </View>

          {!isLogin && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                placeholder="Enter your full name"
                placeholderTextColor="#9aa3af"
                style={styles.input}
                value={signupName}
                onChangeText={setSignupName}
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="Enter email"
              placeholderTextColor="#9aa3af"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              value={isLogin ? loginEmail : signupEmail}
              onChangeText={isLogin ? setLoginEmail : setSignupEmail}
            />
          </View>

          {!isLogin && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>OTP</Text>
              <View style={styles.otpRow}>
                <TextInput
                  placeholder="Enter OTP"
                  placeholderTextColor="#9aa3af"
                  keyboardType="number-pad"
                  maxLength={6}
                  style={[styles.input, styles.otpInput]}
                  value={signupOtp}
                  onChangeText={setSignupOtp}
                />
                <TouchableOpacity
                  style={[styles.otpButton, otpSending && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={otpSending}
                >
                  {otpSending ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.otpButtonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="Enter password"
              placeholderTextColor="#9aa3af"
              secureTextEntry
              style={styles.input}
              value={isLogin ? loginPassword : signupPassword}
              onChangeText={isLogin ? setLoginPassword : setSignupPassword}
            />
          </View>

          {!isLogin && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                placeholder="Re-enter password"
                placeholderTextColor="#9aa3af"
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (loggingIn || registering) && styles.buttonDisabled,
            ]}
            onPress={isLogin ? handleLogin : handleRegister}
            disabled={loggingIn || registering}
          >
            {loggingIn || registering ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>{isLogin ? 'Login' : 'Register'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => setIsLogin((prev) => !prev)}>
              <Text style={styles.switchAction}>
                {isLogin ? 'Signup' : 'Login'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#cbd5f5',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#4f46e5',
  },
  segmentText: {
    color: '#4b5563',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  forgot: {
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  forgotText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otpInput: {
    flex: 1,
  },
  otpButton: {
    backgroundColor: '#334155',
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 96,
  },
  otpButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  switchText: {
    color: '#475569',
    marginRight: 6,
  },
  switchAction: {
    color: '#4f46e5',
    fontWeight: '700',
  },
});
