import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// stripeを初期化
const stripe = require('stripe')(functions.config().stripe.key);
const db = admin.firestore();
const planId = functions.config().stripe.plan_id;
const taxId = functions.config().stripe.tax_id;

// 顧客作成とサブスク開始関数
export const createCustomer = functions
  .region('asia-northeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'permission-denied',
        '権限がありません'
      );
    }
    const customer = await stripe.customers.create(data);

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      default_tax_rates: [taxId],
      items: [{ plan: planId }]
    });

    await db.doc(`users/${context.auth?.uid}`).update({
      isCustomer: true,
      subscriptionId: subscription.id
    });
    // Firestoreの顧客コレクションに顧客IDを記録
    return db.doc(`customers/${context.auth.uid}`).set({
      uid: context.auth.uid,
      customerId: customer.id // 顧客のID
    });
  });

// 課金を開始する関数
export const subscribePlan = functions.region('asia-northeast1').https.onCall(
  async (
    data: {
      customerId: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new Error('認証エラー');
    }

    const subscription = await stripe.subscriptions.create({
      customer: data.customerId,
      default_tax_rates: [taxId],
      items: [{ plan: planId }]
    });
    return db.doc(`users/${context.auth.uid}`).update({
      isCustomer: true,
      subscriptionId: subscription.id
    });
  }
);

// 課金停止
export const unsubscribePlan = functions.region('asia-northeast1').https.onCall(
  async (
    data: {
      userId: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new Error('認証エラー');
    }
    const userPayment = (await db.doc(`users/${data.userId}`).get()).data();

    if (!userPayment) {
      return;
    }
    return stripe.subscriptions.update(userPayment.subscriptionId, {
      cancel_at_period_end: true
    });
  }
);

// 課金停止受信
export const receiveUnsubscribe = functions
  .region('asia-northeast1')
  .https.onRequest(async (req: any, res: any) => {
    const data = req.body.data.object;
    const customer = await db
      .collection('customers')
      .where('customerId', '==', data.customer)
      .get();
    if (!customer) {
      return;
    } else {
      const userId = await customer.docs[0].data().uid;
      res.status(200).send(true);
      return db.doc(`users/${userId}`).update({
        isCustomer: false,
        subscriptionId: null
      });
    }
  });

// 課金成功受信
export const receiveSubscribe = functions
  .region('asia-northeast1')
  .https.onRequest(async (req: any, res: any) => {
    const data = req.body.data.object;
    const customer = await db
      .collection('customers')
      .where('customerId', '==', data.customer)
      .get();
    if (!customer) {
      return;
    } else {
      const period = data.lines.data[0].period;
      const startDate = period.start;
      const endDate = period.end;
      const userId = await customer.docs[0].data().uid;
      res.status(200).send(true);
      return db.doc(`users/${userId}`).update({
        startDate,
        endDate
      });
    }
  });

// user削除時に課金停止
export const deleteCustomer = functions.auth.user().onDelete(async user => {
  const customer = (await db.doc(`customers/${user.uid}`).get()).data();
  return stripe.customers.del(customer?.customerId);
});
