const mysql = require('mysql2');
const express = require('express');
const path = require('path');
const app = express();

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1qazxcvb',
    database: 'bankdata',
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        process.exit(1);
    } else {
        console.log('Connected to MySQL!');
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { accountNo, password } = req.body;
    db.query('SELECT * FROM People WHERE account_no = ?', [accountNo], (err, results) => {
        if (err) {
            console.error('Error fetching account:', err);
            return res.status(500).send('Server error');
        }

        if (results.length === 0) {
            return res.status(404).send('Account not found');
        }

        const user = results[0];
        const storedPassword = user.password;

        if (storedPassword !== password) {
            return res.status(400).send('Invalid login credentials');
        }

        res.status(200).json({
            account_no: user.account_no,
            name: user.name,
            occupation: user.occupation,
            bank_balance: user.bank_balance,
            location: user.location,
            education: user.education
        });
    });
});


app.post('/api/transfer/:senderAccount', (req, res) => {
    const { senderAccount } = req.params;
    const { recipientAccount, amount, transactionType, transactionMethod } = req.body;

    if (!recipientAccount || isNaN(amount) || amount <= 0) {
        return res.status(400).send('Invalid recipient account or amount');
    }

   
    db.query('SELECT * FROM People WHERE account_no = ?', [senderAccount], (err, senderResults) => {
        if (err) {
            console.error('Error fetching sender account:', err);
            return res.status(500).send('Server error');
        }

        if (senderResults.length === 0) {
            return res.status(404).send('Sender account not found');
        }

        const sender = senderResults[0];
        const senderBalance = sender.bank_balance;

        if (senderBalance < amount) {
            return res.status(400).send('Insufficient funds');
        }

        const isAmountSuspicious = amount >= senderBalance * 0.9;

        
        db.query('SELECT * FROM People WHERE account_no = ?', [recipientAccount], (err, recipientResults) => {
            if (err) {
                console.error('Error fetching recipient account:', err);
                return res.status(500).send('Server error');
            }

            if (recipientResults.length === 0) {
                return res.status(404).send('Recipient account not found');
            }

            const recipient = recipientResults[0];

            
            db.query(
                'SELECT * FROM transactions WHERE sender_account_no = ? AND recipient_account_no = ?',
                [senderAccount, recipientAccount],
                (err, transactionHistory) => {
                    if (err) {
                        console.error('Error checking transaction history:', err);
                        return res.status(500).send('Server error');
                    }

                    const isRecipientInHistory = transactionHistory.length > 0;
                    const transactionTypeList = ['Cinema', 'Mall', 'Doctor', 'Shop', 'Transfer', 'Water Park', 'Bank'];
                    const isTransactionTypeValid = transactionTypeList.includes(transactionType) || transactionType === 'Other';
                    const transactionMethodList = ['PayPal', 'PhonePay', 'Google Pay'];
                    const isTransactionMethodValid = transactionMethodList.includes(transactionMethod) || transactionMethod === 'Other';

                    
                    let isAmountHigherThanUsual = false;
                    if (transactionHistory.length > 0) {
                        const avgAmount = transactionHistory.reduce((sum, tx) => sum + tx.amount, 0) / transactionHistory.length;
                        isAmountHigherThanUsual = amount > avgAmount * 2;
                    }

                    
                    const fraudConditions = [
                        !isRecipientInHistory,  
                        isAmountSuspicious || isAmountHigherThanUsual,  
                        !isTransactionTypeValid,  
                        !isTransactionMethodValid  
                    ];

                    const fraudCount = fraudConditions.filter(condition => condition).length;

                   
                    if (fraudCount === 4) {
                       
                        setTimeout(() => {
                            res.status(200).send('This is a fraudulent transaction. The money has been refunded back to your account safely.');
                        }, 15000); 
                    } else {
                        
                        db.beginTransaction(err => {
                            if (err) {
                                console.error('Transaction error:', err);
                                return res.status(500).send('Transaction error');
                            }

                            
                            db.query(
                                'UPDATE People SET bank_balance = bank_balance - ? WHERE account_no = ?',
                                [amount, senderAccount],
                                err => {
                                    if (err) {
                                        return db.rollback(() => {
                                            console.error('Error deducting sender balance:', err);
                                            res.status(500).send('Error processing transaction');
                                        });
                                    }

                                   
                                    db.query(
                                        'UPDATE People SET bank_balance = bank_balance + ? WHERE account_no = ?',
                                        [amount, recipientAccount],
                                        err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    console.error('Error updating recipient balance:', err);
                                                    res.status(500).send('Error processing transaction');
                                                });
                                            }

                                            
                                            db.query(
                                                'INSERT INTO transactions (sender_account_no, recipient_account_no, amount, transaction_type, transaction_method, location) VALUES (?, ?, ?, ?, ?, ?)',
                                                [senderAccount, recipientAccount, amount, transactionType, transactionMethod, sender.location],
                                                err => {
                                                    if (err) {
                                                        return db.rollback(() => {
                                                            console.error('Error logging transaction:', err);
                                                            res.status(500).send('Error processing transaction');
                                                        });
                                                    }

                                                    db.commit(err => {
                                                        if (err) {
                                                            return db.rollback(() => {
                                                                console.error('Commit error:', err);
                                                                res.status(500).send('Error finalizing transaction');
                                                            });
                                                        }

                                                        
                                                        setTimeout(() => {
                                                            res.status(200).send('Transaction completed successfully.');
                                                        }, 15000);
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        });
                    }
                }
            );
        });
    });
});



app.get('/transaction-history/:account_no', (req, res) => {
    const accountNo = req.params.account_no;

    const sqlQuery = `
        SELECT sender_account_no, recipient_account_no, amount, transaction_type, transaction_method
        FROM transactions
        WHERE sender_account_no = ? OR recipient_account_no = ?
    `;
    
    console.log('Executing query:', sqlQuery);
    console.log('With parameters:', [accountNo, accountNo]);

    db.query(sqlQuery, [accountNo, accountNo], (err, results) => {
        if (err) {
            console.error('Error fetching transaction history:', err);
            return res.status(500).send('Error fetching transaction history');
        }

        if (results.length === 0) {
            console.log('No transactions found for account:', accountNo);
            return res.status(404).send('No transaction history found for this account');
        }

        console.log('Transactions found:', results);
        res.status(200).json(results);
    });
});

const PORT = 3843;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
