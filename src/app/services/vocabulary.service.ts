import { Injectable } from '@angular/core';
import {
  AngularFirestore,
  QueryDocumentSnapshot,
  AngularFirestoreCollection
} from '@angular/fire/firestore';
import {
  Vocabulary,
  VocabularyWithAuthor,
  User
} from '../interfaces/vocabulary';
import { Router } from '@angular/router';
import { map, switchMap } from 'rxjs/operators';
import { Observable, combineLatest, of } from 'rxjs';
import { firestore } from 'firebase';

@Injectable({
  providedIn: 'root'
})
export class VocabularyService {
  constructor(
    // データベースにアクセスする
    private db: AngularFirestore,
    private router: Router
  ) {}

  addVocabulary(
    vocabulary: Omit<Vocabulary, 'vocabularyId'>,
    uid: string
  ): Promise<void> {
    // createIdは元からfirebaseの中で定義されている
    const vocabularyId = this.db.createId();
    return this.db
      .doc(`vocabularies/${vocabularyId}`)
      .set({
        vocabularyId,
        ...vocabulary,
        authorId: uid
      })
      .then(() => {
        this.router.navigateByUrl('/myvocabulary');
      });
  }

  getVocabularies(
    sorted: AngularFirestoreCollection<Vocabulary>
  ): Observable<{
    lastDoc: firestore.QueryDocumentSnapshot<firestore.DocumentData>;
    vocabulariesData: VocabularyWithAuthor[];
  }> {
    let vocabularies: Vocabulary[];
    let lastDoc: firestore.QueryDocumentSnapshot<firestore.DocumentData>;
    return sorted.snapshotChanges().pipe(
      map(snaps => snaps.map(snap => snap.payload.doc)),
      switchMap(docs => {
        lastDoc = docs[docs.length - 1];
        // 最後にvocabuleryのデータを取ってくるため
        vocabularies = docs.map(doc => doc.data() as Vocabulary);
        if (vocabularies.length) {
          // 重複なしのauthorIdをとってくる
          const authorIds: string[] = vocabularies
            // 新verのvocabulariesをとってくる
            .filter((vocabulary, index, self) => {
              return (
                // 1ユーザー1vocabularyのvocabulariesを作る
                self.findIndex(
                  item => vocabulary.authorId === item.authorId
                ) === index
              );
            })
            // vocabularyをidだけにする
            .map(vocabulary => vocabulary.authorId);
          return combineLatest(
            authorIds.map(authorId => {
              return this.db.doc<User>(`users/${authorId}`).valueChanges();
            })
          );
        } else {
          return of([]);
        }
      }),
      map((users: User[]) => {
        const vocabulariesData = vocabularies.map(vocabulary => {
          const result: VocabularyWithAuthor = {
            ...vocabulary,
            author: users.find(user => user && user.id === vocabulary.authorId)
          };
          return result;
        });
        return {
          vocabulariesData,
          lastDoc
        };
      })
    );
  }
  getMyVocabularies(
    authorId?: string,
    startAfter?: firestore.QueryDocumentSnapshot<firestore.DocumentData>
  ) {
    const sorted = this.db.collection<Vocabulary>(`vocabularies`, ref => {
      // 作成日順に3件取得
      let query = ref
        .where('authorId', '==', authorId)
        .orderBy('createdAt', 'desc')
        .limit(3);
      // もし開始位置があればそれ以降を取得
      if (startAfter) {
        query = query.startAfter(startAfter);
      }
      // 開始位置がなければそのままかえす
      return query;
    });
    return this.getVocabularies(sorted);
  }

  getLatestVocabularies(): Observable<VocabularyWithAuthor[]> {
    const sorted = this.db.collection<VocabularyWithAuthor>(
      `vocabularies`,
      ref => {
        return ref.orderBy('createdAt', 'desc').limit(5);
      }
    );
    return this.getVocabularies(sorted).pipe(
      map(result => {
        return result.vocabulariesData;
      })
    );
  }
}
