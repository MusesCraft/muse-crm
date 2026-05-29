import pytest

from app.services.llm_service import (
    CODEX_DEFAULT_BASE_URL,
    LLMResponseParseError,
    LLMService,
    LLMServiceError,
)


class FakeResponse:
    def __init__(self, status_code=200, data=None, text=''):
        self.status_code = status_code
        self._data = data or {}
        self.text = text

    def json(self):
        return self._data


def test_default_provider_uses_openrouter(monkeypatch):
    monkeypatch.delenv('LLM_PROVIDER', raising=False)
    monkeypatch.setenv('OPENROUTER_API_KEY', 'openrouter-test-key')
    service = LLMService(max_retries=1)

    def fake_openrouter(**kwargs):
        return {'provider': 'openrouter'}, {'model_used': kwargs['model']}

    def fake_codex(**kwargs):
        raise AssertionError('codex should not be called')

    monkeypatch.setattr(service, '_make_openrouter_request', fake_openrouter)
    monkeypatch.setattr(service, '_make_codex_request', fake_codex)

    result, usage = service._make_request(
        messages=[{'role': 'user', 'content': 'hello'}],
        model='anthropic/claude-3.5-sonnet',
        temperature=0.1,
        max_tokens=128,
        response_format=None,
    )

    assert result == {'provider': 'openrouter'}
    assert usage['model_used'] == 'anthropic/claude-3.5-sonnet'


def test_codex_provider_dispatches_to_codex(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    service = LLMService(max_retries=1)

    def fake_openrouter(**kwargs):
        raise AssertionError('openrouter should not be called')

    def fake_codex(**kwargs):
        return {'provider': 'codex'}, {'model_used': kwargs['model']}

    monkeypatch.setattr(service, '_make_openrouter_request', fake_openrouter)
    monkeypatch.setattr(service, '_make_codex_request', fake_codex)

    result, usage = service._make_request(
        messages=[{'role': 'user', 'content': 'hello'}],
        model='gpt-5.5',
        temperature=0.1,
        max_tokens=128,
        response_format=None,
    )

    assert result == {'provider': 'codex'}
    assert usage['model_used'] == 'gpt-5.5'


def test_codex_response_output_text_is_parsed(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    service = LLMService(timeout=7, max_retries=1)
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append({'url': url, 'json': json, 'headers': headers, 'timeout': timeout})
        return FakeResponse(data={
            'model': 'gpt-5.5',
            'output_text': '{"intent": "pricing", "identity": "unknown"}',
            'usage': {
                'input_tokens': 11,
                'output_tokens': 7,
                'total_tokens': 18,
            },
        })

    monkeypatch.setattr(service._session, 'post', fake_post)

    result, usage = service._make_codex_request(
        messages=[
            {'role': 'system', 'content': 'Return JSON.'},
            {'role': 'user', 'content': '我要報價'},
        ],
        model='gpt-5.5',
        temperature=0.1,
        max_tokens=128,
        response_format=None,
    )

    assert result == {'intent': 'pricing', 'identity': 'unknown'}
    assert usage['model_used'] == 'gpt-5.5'
    assert usage['tokens_used'] == 18
    assert usage['prompt_tokens'] == 11
    assert usage['completion_tokens'] == 7
    assert calls[0]['url'] == f'{CODEX_DEFAULT_BASE_URL}/responses'
    assert calls[0]['headers']['Authorization'] == 'Bearer codex-test-token'
    assert calls[0]['headers']['session_id'] == 'bbcrm-semantic-analysis'
    assert calls[0]['json']['instructions'] == 'Return JSON.'
    assert calls[0]['json']['input'][0]['content'][0]['type'] == 'input_text'
    assert calls[0]['timeout'] == 7


def test_codex_response_output_content_text_is_parsed(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    service = LLMService(max_retries=1)

    def fake_post(url, json, headers, timeout):
        return FakeResponse(data={
            'model': 'gpt-5.4-mini',
            'output': [
                {
                    'type': 'message',
                    'content': [
                        {'type': 'output_text', 'text': '{"intent": "spec"}'},
                    ],
                },
            ],
            'usage': {
                'input_tokens': 5,
                'output_tokens': 6,
                'total_tokens': 11,
            },
        })

    monkeypatch.setattr(service._session, 'post', fake_post)

    result, usage = service._make_codex_request(
        messages=[{'role': 'user', 'content': '尺寸？'}],
        model='gpt-5.4-mini',
        temperature=0.1,
        max_tokens=128,
        response_format=None,
    )

    assert result == {'intent': 'spec'}
    assert usage['model_used'] == 'gpt-5.4-mini'
    assert usage['tokens_used'] == 11


def test_codex_response_without_text_raises_parse_error(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    service = LLMService(max_retries=1)
    monkeypatch.setattr(service._session, 'post', lambda *args, **kwargs: FakeResponse(data={'output': []}))

    with pytest.raises(LLMResponseParseError):
        service._make_codex_request(
            messages=[{'role': 'user', 'content': 'hello'}],
            model='gpt-5.5',
            temperature=0.1,
            max_tokens=128,
            response_format=None,
        )


def test_quick_triage_uses_codex_triage_model(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    monkeypatch.setenv('CODEX_TRIAGE_MODEL', 'gpt-5.4-mini')
    service = LLMService(max_retries=1)
    models = []

    def fake_call_with_retry(**kwargs):
        models.append(kwargs['model'])
        return {'intent': 'pricing', 'identity': 'unknown'}, {'model_used': kwargs['model']}

    monkeypatch.setattr(service, '_call_with_retry', fake_call_with_retry)

    result, usage = service.quick_triage('我要報價')

    assert result['intent'] == 'pricing'
    assert usage['model_used'] == 'gpt-5.4-mini'
    assert models == ['gpt-5.4-mini']


def test_codex_chat_completion_does_not_add_openrouter_fallback_chain(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'codex')
    monkeypatch.setenv('CODEX_ACCESS_TOKEN', 'codex-test-token')
    monkeypatch.setenv('CODEX_MODEL', 'gpt-5.5')
    service = LLMService(max_retries=1)
    models = []

    def fake_call_with_retry(**kwargs):
        models.append(kwargs['model'])
        raise LLMServiceError('forced failure')

    monkeypatch.setattr(service, '_call_with_retry', fake_call_with_retry)

    with pytest.raises(LLMServiceError) as exc:
        service.chat_completion(messages=[{'role': 'user', 'content': 'hello'}])

    assert models == ['gpt-5.5']
    assert '共 1 個' in str(exc.value)
    assert 'anthropic/claude-3.5-sonnet' not in models
    assert 'openai/gpt-4' not in models


def test_codex_messages_to_payload_combines_system_instructions():
    payload = LLMService._messages_to_codex_payload([
        {'role': 'system', 'content': 'A'},
        {'role': 'system', 'content': 'B'},
        {'role': 'user', 'content': 'C'},
    ])

    assert payload['instructions'] == 'A\n\nB'
    assert payload['input'] == [
        {'role': 'user', 'content': [{'type': 'input_text', 'text': 'C'}]},
    ]
    assert payload['store'] is False
