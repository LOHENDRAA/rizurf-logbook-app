<?php

namespace Database\Factories;

use App\Models\Placement;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Placement>
 */
class PlacementFactory extends Factory
{
    protected $model = Placement::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $start = fake()->dateTimeBetween('-60 days', '-30 days')->format('Y-m-d');

        return [
            'id' => 'placement-'.Str::lower(Str::random(8)),
            'student_id' => 'student-'.Str::lower(Str::random(8)),
            'company_id' => 'company-nusantara',
            'university_name' => 'Universiti Teknologi Malaysia',
            'programme_name' => 'BSc Computer Science',
            'programme_timezone' => 'Asia/Kuala_Lumpur',
            'position' => 'Software Engineering Intern',
            'start_date' => $start,
            'end_date' => date('Y-m-d', strtotime($start.' +83 days')),
        ];
    }
}
