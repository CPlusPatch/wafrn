import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PostEditorComponent } from './post-editor.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { MediaPreviewModule } from '../media-preview/media-preview.module';


@NgModule({
  declarations: [
    PostEditorComponent
  ],
  imports: [
    CommonModule,
    QuillModule,
    FormsModule,
    ReactiveFormsModule,
    MediaPreviewModule
  ],
  exports: [
    PostEditorComponent
  ]
})
export class PostEditorModule { }
