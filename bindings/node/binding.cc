#include "nan.h"
#include "tree_sitter/parser.h"

using namespace v8;

extern "C" TSLanguage *tree_sitter_quazi();

namespace {

NAN_METHOD(New) {}

void Init(Local<Object> exports, Local<Object> module) {
  Nan::Set(exports,
    Nan::New("name").ToLocalChecked(),
    Nan::New("quazi").ToLocalChecked());
  Nan::Set(exports,
    Nan::New("language").ToLocalChecked(),
    Nan::New<External>((void *)tree_sitter_quazi()));
}

NODE_MODULE(tree_sitter_quazi_binding, Init)

}  // namespace
