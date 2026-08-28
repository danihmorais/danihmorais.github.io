# Exportação PDF

O Gerador de Extrato utiliza `modelo/EXTRATO.docx` como modelo interno de layout e converte o DOCX para PDF no servidor usando **Aspose.Words**, sem depender de LibreOffice ou Microsoft Office. A dependência é instalada pelo `requirements.txt`.

## Requisitos

```bash
pip install -r requirements.txt
```

O Aspose.Words pode operar em modo de avaliação. Para uso licenciado, configure `ASPOSE_WORDS_LICENSE` apontando para o arquivo de licença. Opcionalmente, `ASPOSE_FONT_DIR` pode apontar para uma pasta com as fontes usadas no modelo para melhorar a fidelidade visual.

O endpoint `/api/generate` (também disponível em `/geradorextrato/api/generate`) monta o documento e devolve exclusivamente o PDF. O endpoint `/api/generate-docx` permite conferir o DOCX gerado.
