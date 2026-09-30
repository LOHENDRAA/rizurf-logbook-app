<?php

namespace Tests\Feature;

use App\Http\Controllers\HealthController;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Keeps resources/openapi.json true to the routes and complete for the gateway's
 * catalogue (RIZURF_API_TEMPLATE.md SS-3, SS-23, SS-27).
 */
class OpenApiTest extends TestCase
{
    private const CATEGORIES = ['Identity & Authentication', 'Finance & Payments', 'Billing', 'Commerce', 'Customer Management',
        'Notifications', 'Documents', 'Analytics', 'Reporting', 'Utilities', 'Operations'];

    private const INDUSTRIES = ['Main Database', 'Human Resources', 'Marketing', 'Sales', 'Finance', 'IT', 'Operations', 'Legal', 'Support'];

    public function test_document_is_public_openapi_3_with_catalogue_info(): void
    {
        $doc = $this->doc();
        $operations = $this->operations($doc);

        $this->assertStringStartsWith('3.', $doc['openapi']);
        $this->assertNotEmpty($doc['info']['title']);
        $this->assertNotEmpty($doc['info']['description']);
        $this->assertSame(HealthController::VERSION, $doc['info']['version']);

        $meta = $doc['info']['x-rizurf'];
        $this->assertNotEmpty($meta['domain']);
        $this->assertNotEmpty($meta['owner']);
        $this->assertContains($meta['category'], self::CATEGORIES);
        $this->assertNotEmpty($meta['industries']);
        foreach ($meta['industries'] as $industry) {
            $this->assertContains($industry, self::INDUSTRIES);
        }
        $this->assertNotEmpty($meta['use_cases']);
        $this->assertIsArray($meta['related_services']);

        $this->assertNotEmpty($meta['capabilities']);
        foreach ($meta['capabilities'] as $capability) {
            foreach (['name', 'icon', 'description', 'best_for', 'does', 'endpoints'] as $key) {
                $this->assertNotEmpty($capability[$key] ?? null, "capability {$key}");
            }
            foreach ($capability['endpoints'] as $endpoint) {
                $this->assertContains($endpoint, $operations, "capability {$capability['name']}");
            }
        }

        $this->assertNotEmpty($meta['workflows']);
        foreach ($meta['workflows'] as $workflow) {
            $this->assertNotEmpty($workflow['name']);
            $this->assertNotEmpty($workflow['steps']);
            foreach ($workflow['steps'] as $step) {
                $this->assertContains($step, $operations, "workflow {$workflow['name']}");
            }
        }
    }

    public function test_every_route_is_documented_and_nothing_else(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $route) => str_starts_with($route->uri(), 'api/v1/'))
            ->flatMap(fn (RoutingRoute $route) => collect($route->methods())
                ->reject(fn (string $method) => $method === 'HEAD')
                ->map(fn (string $method) => $method.' /'.substr($route->uri(), strlen('api/v1/'))))
            ->sort()
            ->values()
            ->all();

        $documented = $this->operations($this->doc());
        sort($documented);

        $this->assertSame($routes, $documented);
    }

    public function test_every_operation_carries_a_summary_and_discovery_metadata(): void
    {
        $doc = $this->doc();
        $operations = $this->operations($doc);

        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                $label = strtoupper($method).' '.$path;
                $this->assertNotEmpty($operation['summary'] ?? null, "{$label} summary");

                $meta = $operation['x-rizurf'] ?? [];
                foreach (['name', 'purpose', 'use_when', 'tags'] as $key) {
                    $this->assertNotEmpty($meta[$key] ?? null, "{$label} {$key}");
                }
                foreach (['do_not_use_when', 'inputs', 'outputs', 'requires', 'related_endpoints'] as $key) {
                    $this->assertIsArray($meta[$key] ?? null, "{$label} {$key}");
                }
                foreach ($meta['related_endpoints'] as $related) {
                    $this->assertContains($related, $operations, "{$label} related_endpoints");
                }
            }
        }
    }

    public function test_every_operation_has_responses_and_declares_its_path_parameters(): void
    {
        foreach ($this->doc()['paths'] as $path => $item) {
            preg_match_all('/\{([^}]+)\}/', $path, $templated);
            $expected = $templated[1];
            sort($expected);

            foreach ($item as $method => $operation) {
                $label = strtoupper($method).' '.$path;
                // Both are REQUIRED by OpenAPI 3.0.3; SS-3 asks for a valid document.
                $this->assertNotEmpty($operation['responses'] ?? null, "{$label} responses");

                $declared = [];
                foreach ($operation['parameters'] ?? [] as $parameter) {
                    if (($parameter['in'] ?? null) === 'path' && ($parameter['required'] ?? false) === true && isset($parameter['schema'])) {
                        $declared[] = $parameter['name'];
                    }
                }
                sort($declared);
                $this->assertSame($expected, $declared, "{$label} path parameters");
            }
        }
    }

    public function test_only_health_the_document_and_temporary_login_are_public(): void
    {
        $doc = $this->doc();
        $public = [];
        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (($operation['security'] ?? null) === []) {
                    $public[] = strtoupper($method).' '.$path;
                }
            }
        }
        sort($public);

        $this->assertSame(['GET /health', 'GET /openapi.json', 'POST /auth/login'], $public);
        $this->assertSame([['sessionCookie' => []]], $doc['security']);
        $this->assertSame(config('session.cookie'), $doc['components']['securitySchemes']['sessionCookie']['name']);
    }

    public function test_every_protected_operation_refuses_anonymous_callers(): void
    {
        $doc = $this->doc();

        foreach ($doc['paths'] as $path => $item) {
            foreach ($item as $method => $operation) {
                if (($operation['security'] ?? null) === []) {
                    continue;
                }
                $uri = '/api/v1'.preg_replace('/\{[^}]+\}/', '1', $path);

                $this->flushHeaders()
                    ->json(strtoupper($method), $uri)
                    ->assertUnauthorized()
                    ->assertJsonPath('error.code', 'UNAUTHORIZED');
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function doc(): array
    {
        $response = $this->get('/api/v1/openapi.json')->assertOk();
        $this->assertStringStartsWith('application/json', (string) $response->headers->get('Content-Type'));

        return json_decode((string) $response->getContent(), true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array<string, mixed>  $doc
     * @return list<string> "METHOD /path" for every documented operation
     */
    private function operations(array $doc): array
    {
        $operations = [];
        foreach ($doc['paths'] as $path => $item) {
            foreach (array_keys($item) as $method) {
                $operations[] = strtoupper($method).' '.$path;
            }
        }

        return $operations;
    }
}
