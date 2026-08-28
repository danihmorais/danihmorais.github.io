# Exportação PDF

O Gerador de Extrato utiliza `modelo/EXTRATO.docx` somente como modelo interno de layout.

O endpoint `/api/generate` monta o documento e o converte no servidor para PDF usando LibreOffice em modo headless. O navegador recebe e baixa exclusivamente o arquivo `.pdf`.

## Requisito do servidor

O servidor que executa a API precisa ter o comando `libreoffice` ou `soffice` disponível no PATH.

Em Ubuntu/Debian, por exemplo:

```bash
sudo apt update
sudo apt install -y libreoffice
```

O arquivo `.docx` não é disponibilizado ao usuário final.
