/** Shared, plain-English labels for the RoomHisaab interface. */
export const text = {
  navigation: {
    home: 'Home', expenses: 'Expenses', add: 'Add', settle: 'Settle Up', members: 'Members',
    reports: 'Reports', importExpenses: 'Import Expenses', recurringBills: 'Recurring Bills',
    help: 'Help', settings: 'Settings', more: 'More',
  },
  headings: { home: 'Home', thisMonth: 'This Month', paymentHistory: 'Payment History', addMembers: 'Add Members', monthlyPeriod: 'Monthly Period', saveRoom: 'Save Your Room' },
  fields: { expenseName: 'What did you buy?', amount: 'Amount', paymentMethod: 'Payment method', paymentStatus: 'Payment status' },
  helpText: { unpaidBalance: 'This expense will not change room balances until it is marked as paid.', reviewRecurring: 'Check the amount and split before saving this bill.' },
  emptyStates: { expenses: 'No expenses yet. Add your first expense to see the room balance.' },
  errors: { offline: 'You are offline. Your changes will sync when you reconnect.', unsaved: 'You have unsaved changes.' },
  successMessages: { expenseAdded: 'Expense added successfully.', savedUnpaid: 'Expense saved as unpaid.' },
  actions: {
    createRoom: 'Create Room', joinRoom: 'Join Room', signIn: 'Sign In', addExpense: 'Add Expense',
    saveExpense: 'Save Expense', saveAsPaid: 'Yes, Save as Paid', saveAsUnpaid: 'Save as Unpaid', scanPay: 'Scan & Pay', openUpiApp: 'Open UPI App',
    confirmPayment: 'I Completed the Payment', confirmReceived: 'Confirm Received',
    inviteMember: 'Invite Member', saveChanges: 'Save Changes', downloadBackup: 'Download Backup', cancel: 'Cancel',
    markPaid: 'Mark as Paid', reviewBill: 'Review Bill', changeStartDate: 'Change Start Date',
  },
  payments: { paid: 'Paid', notPaid: 'Not Paid', waitingConfirmation: 'Waiting for Confirmation', paymentHistory: 'Payment History' },
  members: { appMember: 'App Member', trackingOnly: 'Tracking-Only Member' },
  safety: {
    noBankCheck: 'RoomHisaab cannot check your bank payment automatically. Check your payment app before you mark a payment as complete.',
    pin: 'Enter your UPI PIN only in your payment app. RoomHisaab never asks for your PIN or OTP.',
  },
} as const
