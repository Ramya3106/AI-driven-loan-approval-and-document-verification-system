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
} from 'react-native';

export default function Login({ navigation }) {
  const [isLogin, setIsLogin] = useState(true);

  const handleLogin = () => {
    // Add your authentication logic here
    // For now, navigate directly to Application page
    navigation.navigate('Application');
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
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email / Phone</Text>
            <TextInput
              placeholder="Enter email or phone"
              placeholderTextColor="#9aa3af"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              placeholder="Enter password"
              placeholderTextColor="#9aa3af"
              secureTextEntry
              style={styles.input}
            />
          </View>

          {isLogin ? (
            <TouchableOpacity style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                placeholder="Re-enter password"
                placeholderTextColor="#9aa3af"
                secureTextEntry
                style={styles.input}
              />
            </View>
          )}

          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleLogin}
          >
            <Text style={styles.primaryButtonText}>
              {isLogin ? 'Login 🔑' : 'Create Account'}
            </Text>
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
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
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
