import { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const toPositiveNumber = (value) => {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatCurrency = (amount) => {
  const rounded = Math.max(0, Math.round(amount));
  return `Rs ${rounded.toLocaleString('en-IN')}`;
};

const getJobTypeScore = (jobType) => {
  const key = String(jobType || '').toLowerCase();
  if (key === 'govt') return 95;
  if (key === 'private') return 82;
  if (key === 'self-employed') return 72;
  if (key === 'student') return 55;
  return 65;
};

const getLoanTypeRiskScore = (loanType) => {
  const key = String(loanType || '').toLowerCase();
  if (key === 'home') return 88;
  if (key === 'education') return 84;
  if (key === 'gold') return 86;
  if (key === 'vehicle') return 78;
  if (key === 'personal') return 68;
  if (key === 'business') return 72;
  return 70;
};

const getEmiHistoryScore = (emiHistory) => {
  const hasExistingLoan = emiHistory?.hasExistingLoan === true;
  if (!hasExistingLoan) {
    return 80;
  }

  const pending = String(emiHistory?.pendingEMI || '').toLowerCase();
  const monthlyEmi = toPositiveNumber(emiHistory?.monthlyEMI);

  if (pending === 'yes') {
    return 20;
  }

  if (monthlyEmi <= 0) {
    return 70;
  }

  return 85;
};

const predictEligibility = ({
  annualIncome,
  cibilScore,
  jobType,
  loanType,
  documentVerificationScore,
  emiHistory,
  requestedLoanAmount,
}) => {
  const income = toPositiveNumber(annualIncome);
  const cibil = clamp(toPositiveNumber(cibilScore), 300, 900);
  const documentScore = clamp(toPositiveNumber(documentVerificationScore), 0, 100);
  const requested = toPositiveNumber(requestedLoanAmount);
  const monthlyIncome = income > 0 ? income / 12 : 0;

  const incomeScore = clamp((income / 1200000) * 100, 20, 100);
  const cibilNormalized = clamp(((cibil - 300) / 600) * 100, 0, 100);
  const jobScore = getJobTypeScore(jobType);
  const loanScore = getLoanTypeRiskScore(loanType);
  const emiScore = getEmiHistoryScore(emiHistory);

  const weightedScore =
    cibilNormalized * 0.3
    + incomeScore * 0.2
    + jobScore * 0.15
    + loanScore * 0.1
    + documentScore * 0.15
    + emiScore * 0.1;

  const approvalPercentage = clamp(Math.round(weightedScore), 0, 99);

  // Suggest up to ~10 months of affordable EMI, scaled by model confidence.
  const affordabilityBase = monthlyIncome * 10;
  const confidenceMultiplier = approvalPercentage / 100;
  const safeAmount = Math.round(affordabilityBase * confidenceMultiplier);
  const suggestedLoanAmount = requested > 0 ? Math.min(requested, safeAmount) : safeAmount;

  const decisionLabel = approvalPercentage >= 75
    ? 'Eligible'
    : approvalPercentage >= 55
      ? 'Moderate Risk'
      : 'High Risk';

  return {
    approvalPercentage,
    decisionLabel,
    suggestedLoanAmount,
    income,
    cibil,
    documentScore,
    emiScore,
    jobScore,
    loanScore,
  };
};

export default function ResultPage({ route, navigation }) {
  const {
    annualIncome,
    cibilScore,
    jobType,
    loanType,
    documentVerificationScore,
    emiHistory,
    requestedLoanAmount,
  } = route?.params || {};

  const result = useMemo(() => {
    return predictEligibility({
      annualIncome,
      cibilScore,
      jobType,
      loanType,
      documentVerificationScore,
      emiHistory,
      requestedLoanAmount,
    });
  }, [
    annualIncome,
    cibilScore,
    jobType,
    loanType,
    documentVerificationScore,
    emiHistory,
    requestedLoanAmount,
  ]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTag}>5 AI APPROVAL RESULT PAGE</Text>
        <Text style={styles.title}>Your Loan Eligibility Result</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Approval Percentage</Text>
          <Text style={styles.resultValue}>{result.approvalPercentage}% {result.decisionLabel}</Text>
          <Text style={styles.helperText}>Model inputs: income, CIBIL, job type, loan type, docs score, EMI history.</Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Loan Amount Suggestion</Text>
          <Text style={styles.resultValue}>You can safely get {formatCurrency(result.suggestedLoanAmount)}</Text>
          <Text style={styles.helperText}>Requested amount is capped by affordability and predicted risk level.</Text>
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>AI Feature Breakdown</Text>
          <Text style={styles.breakdownItem}>Annual Income: {formatCurrency(result.income)}</Text>
          <Text style={styles.breakdownItem}>CIBIL Score: {result.cibil}</Text>
          <Text style={styles.breakdownItem}>Document Verification Score: {result.documentScore}/100</Text>
          <Text style={styles.breakdownItem}>Job Stability Score: {result.jobScore}/100</Text>
          <Text style={styles.breakdownItem}>Loan Type Risk Score: {result.loanScore}/100</Text>
          <Text style={styles.breakdownItem}>EMI History Score: {result.emiScore}/100</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Back to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => navigation.navigate('Application')}
          >
            <Text style={[styles.actionButtonText, styles.primaryButtonText]}>Apply</Text>
          </TouchableOpacity>
        </View>
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
  pageTag: {
    fontSize: 14,
    color: '#3b4d66',
    marginBottom: 8,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    color: '#0f172a',
    fontWeight: '800',
    marginBottom: 18,
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d8e2f0',
    padding: 16,
    marginBottom: 14,
  },
  resultLabel: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 8,
    fontWeight: '700',
  },
  resultValue: {
    fontSize: 24,
    color: '#1237bf',
    fontWeight: '800',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
  breakdownCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d8e2f0',
    padding: 16,
  },
  breakdownTitle: {
    fontSize: 17,
    color: '#1e293b',
    fontWeight: '800',
    marginBottom: 10,
  },
  breakdownItem: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 7,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: '#1237bf',
    borderColor: '#1237bf',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#bfd0f5',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  secondaryButtonText: {
    color: '#1e3a8a',
  },
});
