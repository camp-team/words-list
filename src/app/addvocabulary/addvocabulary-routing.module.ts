import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AddvocabularyComponent } from './addvocabulary/addvocabulary.component';

const routes: Routes = [
  {
    path: '',
    component: AddvocabularyComponent
  },
  {
    path: 'edit',
    component: AddvocabularyComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AddvocabularyRoutingModule {}
