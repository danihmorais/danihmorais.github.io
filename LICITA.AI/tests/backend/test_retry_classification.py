import unittest

from fila_pipeline import ErroPermanente
from fila_pipeline_unificado import _classificar_erro_permanente


class TestRetryClassification(unittest.TestCase):
    def test_errors_de_validacao_e_documento_sao_permanentes(self):
        self.assertTrue(_classificar_erro_permanente(ErroPermanente("entrada inválida")))
        self.assertTrue(_classificar_erro_permanente(ValueError("campo inválido")))
        self.assertTrue(_classificar_erro_permanente(TypeError("tipo inválido")))
        self.assertTrue(_classificar_erro_permanente(RuntimeError("falha ao montar DOCX")))

    def test_erros_de_transporte_e_rate_limit_sao_retentaveis(self):
        self.assertFalse(_classificar_erro_permanente(TimeoutError("timeout")))
        self.assertFalse(_classificar_erro_permanente(ConnectionError("conexão interrompida")))
        self.assertFalse(_classificar_erro_permanente(RuntimeError("IA HTTP 503: servidor indisponível")))
        self.assertFalse(_classificar_erro_permanente(RuntimeError("IA HTTP 429: limite de taxa")))

    def test_http_4xx_sem_retry_e_http_429_retentavel(self):
        class ErroHttp(Exception):
            def __init__(self, status_code):
                self.status_code = status_code

        self.assertTrue(_classificar_erro_permanente(ErroHttp(400)))
        self.assertTrue(_classificar_erro_permanente(ErroHttp(401)))
        self.assertFalse(_classificar_erro_permanente(ErroHttp(408)))
        self.assertFalse(_classificar_erro_permanente(ErroHttp(429)))
        self.assertFalse(_classificar_erro_permanente(ErroHttp(503)))


if __name__ == "__main__":
    unittest.main()
